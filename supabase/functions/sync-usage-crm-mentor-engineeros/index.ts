import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_WEBHOOK_URL = "https://project--f10e40b9-a936-4a47-a2fd-95aef668b56f-dev.lovable.app/api/public/receive-usage-sync";
const SOURCE_SYSTEM = "mentor_engineeros_customization";

function getCycleStart(billingCycleStart: string | null | undefined): string {
  if (!billingCycleStart) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const now = new Date();
  const current = new Date(billingCycleStart);
  while (true) {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    if (next > now) break;
    current.setTime(next.getTime());
  }
  return current.toISOString();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    // We use the service role key to bypass RLS and read all customer usage
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: 'mentor_engineeros_customization' } });

    console.log("Starting CRM usage sync...");

    // 1. Get plan limits from platform_settings
    const { data: settingsData, error: settingsErr } = await supabase
      .schema("mentor_engineeros_customization").from("platform_settings")
      .select("value")
      .eq("key", "plan_limits")
      .maybeSingle();

    if (settingsErr) throw new Error(`Failed to fetch plan_limits: ${settingsErr.message}`);
    
    const planLimits = settingsData?.value || {};
    // Extract base contacts limit per tier, defaulting to 500 if undefined
    const getBaseLimit = (tier: string) => {
      const tierConfig = planLimits[tier];
      return tierConfig?.contacts_per_month ?? 500;
    };

    // 2. Get profiles to know each user's tier and addon_contacts
    const { data: profiles, error: profilesErr } = await supabase
      .schema("mentor_engineeros_customization").from("profiles")
      .select("user_id, plan_tier, addon_contacts, billing_cycle_start");

    if (profilesErr) throw new Error(`Failed to fetch profiles: ${profilesErr.message}`);

    // 3. Get distinct contact usage count per user
    let allUsage: any[] = [];
    let hasMore = true;
    let page = 0;
    const pageSize = 10000;

    while (hasMore) {
      const { data, error } = await supabase
        .schema("mentor_engineeros_customization").from("contact_usage")
        .select("user_id, phone_number, created_at")
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) throw new Error(`Failed to fetch contact usage: ${error.message}`);
      
      if (data && data.length > 0) {
        allUsage = allUsage.concat(data);
        page++;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // Group by user_id and count unique phone numbers (applying billing cycle dates)
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    const usageCountMap: Record<string, Set<string>> = {};
    const lifetimeUsageCountMap: Record<string, Set<string>> = {}; // for tiebreaker
    
    for (const row of allUsage) {
      // Lifetime usage for tiebreaker
      if (!lifetimeUsageCountMap[row.user_id]) {
        lifetimeUsageCountMap[row.user_id] = new Set();
      }
      lifetimeUsageCountMap[row.user_id].add(row.phone_number);

      // Cycle-specific usage for actual syncing
      const userProfile = profileMap.get(row.user_id);
      const cycleStartDate = getCycleStart(userProfile?.billing_cycle_start);
      if (new Date(row.created_at) >= new Date(cycleStartDate)) {
        if (!usageCountMap[row.user_id]) {
          usageCountMap[row.user_id] = new Set();
        }
        usageCountMap[row.user_id].add(row.phone_number);
      }
    }

    // 4. Identify the true owner account of this customization
    // Since profiles are synced across all schemas, we must filter out the dummy profiles.
    // The true owner is the account that has configured the most business settings locally.
    const { data: userSettingsData, error: userSettingsErr } = await supabase
      .schema(SOURCE_SYSTEM).from("settings")
      .select("user_id");

    if (userSettingsErr) throw new Error(`Failed to fetch settings: ${userSettingsErr.message}`);

    const userCounts: Record<string, number> = {};
    for (const row of userSettingsData || []) {
      userCounts[row.user_id] = (userCounts[row.user_id] || 0) + 1;
    }

    let ownerUserId: string | null = null;
    let maxCount = 0;
    let candidates: string[] = [];
    for (const [userId, count] of Object.entries(userCounts)) {
      if (count > maxCount) {
        maxCount = count;
        candidates = [userId];
      } else if (count === maxCount) {
        candidates.push(userId);
      }
    }

    if (candidates.length > 0) {
      let maxUsage = -1;
      for (const uid of candidates) {
        const usage = lifetimeUsageCountMap[uid]?.size || 0;
        if (usage > maxUsage) {
          maxUsage = usage;
          ownerUserId = uid;
        }
      }
    }

    // Filter profiles to ONLY the true owner
    const targetProfiles = ownerUserId ? profiles.filter(p => p.user_id === ownerUserId) : profiles;

    // 5. Construct payload
    const usages = targetProfiles.map(profile => {
      const baseLimit = getBaseLimit(profile.plan_tier || 'free');
      const addonLimit = profile.addon_contacts || 0;
      const totalAllowed = baseLimit + addonLimit;
      
      const usedSet = usageCountMap[profile.user_id];
      const contactsUsed = usedSet ? usedSet.size : 0;

      return {
        crm_integration_key: profile.user_id,
        contacts_used: contactsUsed,
        total_allowed: totalAllowed
      };
    });

    console.log(`Sending usage data for ${usages.length} customers to CRM...`);

    // 5. Send POST request to CRM
    const response = await fetch(CRM_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_system: SOURCE_SYSTEM,
        usages: usages
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CRM API responded with status ${response.status}: ${errText}`);
    }

    console.log("Successfully synced usage to CRM.");

    return new Response(JSON.stringify({ success: true, processed: usages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
