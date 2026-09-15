import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: 'mentor_engineeros_customization' } });

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { action, ...params } = await req.json();
    console.log(`Staff action: ${action} by ${callerId}`);

    switch (action) {
      case "create_staff": {
        const { email, password, name, permissions, whatsapp_number } = params;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create the staff user via admin API
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name || email, is_staff: true },
        });

        if (createError) {
          console.error("Create staff error:", createError);
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Link staff to owner
        const { error: linkError } = await supabase.from("staff_accounts").insert({
          owner_id: callerId,
          staff_user_id: newUser.user.id,
          staff_email: email,
          staff_name: name || null,
          whatsapp_number: whatsapp_number || null,
          permissions: permissions || [],
        });

        if (linkError) {
          console.error("Link staff error:", linkError);
          // Clean up: delete the created user
          await supabase.auth.admin.deleteUser(newUser.user.id);
          return new Response(JSON.stringify({ error: linkError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Created staff ${newUser.user.id} for owner ${callerId}`);
        return new Response(JSON.stringify({ success: true, staffUserId: newUser.user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_staff": {
        const { staffId, permissions: updPerms, name: updName, is_active, whatsapp_number: updWa } = params;
        if (!staffId) {
          return new Response(JSON.stringify({ error: "staffId required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateData: Record<string, any> = {};
        if (updPerms !== undefined) updateData.permissions = updPerms;
        if (updName !== undefined) updateData.staff_name = updName;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (updWa !== undefined) updateData.whatsapp_number = updWa;

        const { error } = await supabase
          .from("staff_accounts")
          .update(updateData)
          .eq("id", staffId)
          .eq("owner_id", callerId);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_staff": {
        const { staffId: delId } = params;
        if (!delId) {
          return new Response(JSON.stringify({ error: "staffId required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the staff user id before deleting
        const { data: staffRecord } = await supabase
          .from("staff_accounts")
          .select("staff_user_id")
          .eq("id", delId)
          .eq("owner_id", callerId)
          .single();

        if (!staffRecord) {
          return new Response(JSON.stringify({ error: "Staff not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Delete the staff record
        await supabase.from("staff_accounts").delete().eq("id", delId).eq("owner_id", callerId);

        // Delete the auth user
        await supabase.auth.admin.deleteUser(staffRecord.staff_user_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_staff": {
        const { data: staff, error } = await supabase
          .from("staff_accounts")
          .select("*")
          .eq("owner_id", callerId)
          .order("created_at", { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ staff: staff || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Manage staff error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
