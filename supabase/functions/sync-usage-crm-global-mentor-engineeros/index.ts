import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRM_WEBHOOK_URL = "https://project--f10e40b9-a936-4a47-a2fd-95aef668b56f-dev.lovable.app/api/public/receive-usage-sync";
const SOURCE_SYSTEM = "global";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: 'mentor_engineeros_customization' } });

    console.log(`Starting GLOBAL CRM usage sync...`);

    // 1. Get plan limits from platform_settings
    const { data: settingsData, error: settingsErr } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "plan_limits")
      .single();

    if (settingsErr) throw new Error(`Failed to fetch plan_limits: ${settingsErr.message}`);
    
    const planLimits = settingsData?.value || {};
    const getBaseLimit = (tier: string) => {
      const tierConfig = planLimits[tier];
      return tierConfig?.contacts_per_month ?? 500;
    };

    // 2. Get profiles to know each user's tier and addon_contacts
    // Because of the database trigger we created, public.profiles is perfectly synced with all other schemas.
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("user_id, plan_tier, addon_contacts");

    if (profilesErr) throw new Error(`Failed to fetch profiles: ${profilesErr.message}`);

    // 3. Get global contact usage across ALL schemas via the stored procedure
    const { data: globalUsage, error: usageErr } = await supabase
      .rpc('get_global_contact_usage');

    if (usageErr) throw new Error(`Failed to fetch global usage: ${usageErr.message}`);

    // Create a map for fast lookup
    const usageCountMap: Record<string, number> = {};
    if (globalUsage) {
      for (const row of globalUsage) {
        usageCountMap[row.user_id] = parseInt(row.total_contacts) || 0;
      }
    }

    // 4. Construct payload
    const usages = profiles.map(profile => {
      const baseLimit = getBaseLimit(profile.plan_tier || 'free');
      const addonLimit = profile.addon_contacts || 0;
      const totalAllowed = baseLimit + addonLimit;
      
      const contactsUsed = usageCountMap[profile.user_id] || 0;

      return {
        crm_integration_key: profile.user_id,
        contacts_used: contactsUsed,
        total_allowed: totalAllowed
      };
    });

    console.log(`Sending global usage data for ${usages.length} customers to CRM...`);

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

    console.log("Successfully synced global usage to CRM.");

    return new Response(JSON.stringify({ success: true, processed: usages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Global Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
