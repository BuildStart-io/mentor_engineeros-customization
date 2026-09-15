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

    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Use getClaims for JWT validation (works with ES256 signing on Lovable Cloud)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("Auth error:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = { id: claimsData.claims.sub as string };

    // Check super_admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin access required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();
    console.log(`Admin action: ${action} by ${caller.id}`);

    const triggerCrmSync = () => {
      fetch(`${supabaseUrl}/functions/v1/sync-usage-crm-global`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" }
      }).catch(e => console.error("CRM sync trigger failed", e));
    };

    switch (action) {
      case "create_user": {
        const { email, password, fullName, businessName, planTier } = params;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create the user via admin API
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || email },
        });

        if (createError) {
          console.error("Create user error:", createError);
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update profile with business info and plan
        const planLimits = getPlanLimits(planTier || "free");
        await supabase
          .from("profiles")
          .update({
            business_name: businessName || null,
            plan_tier: planTier || "free",
            max_products: planLimits.maxProducts,
            max_faqs: planLimits.maxFaqs,
          })
          .eq("user_id", newUser.user.id);

        console.log(`Created user ${newUser.user.id} with plan ${planTier}`);
        triggerCrmSync();
        return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "invite_user": {
        const { email: inviteEmail, businessName: invBizName, planTier: invPlan } = params;
        if (!inviteEmail) {
          return new Response(JSON.stringify({ error: "Email required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: invitedUser, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(inviteEmail);
        if (inviteError) {
          console.error("Invite error:", inviteError);
          return new Response(JSON.stringify({ error: inviteError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update profile
        const invPlanLimits = getPlanLimits(invPlan || "free");
        await supabase
          .from("profiles")
          .update({
            business_name: invBizName || null,
            plan_tier: invPlan || "free",
            max_products: invPlanLimits.maxProducts,
            max_faqs: invPlanLimits.maxFaqs,
          })
          .eq("user_id", invitedUser.user.id);

        console.log(`Invited user ${invitedUser.user.id}`);
        triggerCrmSync();
        return new Response(JSON.stringify({ success: true, userId: invitedUser.user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_user": {
        const { userId, businessName: updBiz, planTier: updPlan, isActive, billingCycleStart, isPaused, addon_products, addon_faqs, addon_orders, addon_contacts, addon_images, addon_staff } = params;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateData: Record<string, any> = {};
        if (updBiz !== undefined) updateData.business_name = updBiz;
        if (isActive !== undefined) updateData.is_active = isActive;
        if (isPaused !== undefined) updateData.is_paused = isPaused;
        if (billingCycleStart !== undefined) updateData.billing_cycle_start = billingCycleStart;
        if (addon_products !== undefined) updateData.addon_products = addon_products;
        if (addon_faqs !== undefined) updateData.addon_faqs = addon_faqs;
        if (addon_orders !== undefined) updateData.addon_orders = addon_orders;
        if (addon_contacts !== undefined) updateData.addon_contacts = addon_contacts;
        if (addon_images !== undefined) updateData.addon_images = addon_images;
        if (addon_staff !== undefined) updateData.addon_staff = addon_staff;
        if (updPlan) {
          updateData.plan_tier = updPlan;
          const limits = getPlanLimits(updPlan);
          updateData.max_products = limits.maxProducts;
          updateData.max_faqs = limits.maxFaqs;
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("user_id", userId);

        if (updateError) {
          console.error("Update error:", updateError);
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        triggerCrmSync();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_user": {
        const { userId: delUserId } = params;
        if (!delUserId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: delError } = await supabase.auth.admin.deleteUser(delUserId);
        if (delError) {
          console.error("Delete error:", delError);
          return new Response(JSON.stringify({ error: delError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_users": {
        const { data: profiles, error: listError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        // Exclude staff accounts - they belong under their owner's business
        const { data: staffRows } = await supabase
          .from("staff_accounts")
          .select("staff_user_id");
        const staffIds = new Set((staffRows || []).map((s: any) => s.staff_user_id));

        if (listError) {
          console.error("List error:", listError);
          return new Response(JSON.stringify({ error: listError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get stats for each user
        const usersWithStats = await Promise.all(
          (profiles || []).filter((p: any) => !staffIds.has(p.user_id)).map(async (profile) => {
            const [prodRes, faqRes, orderRes] = await Promise.all([
              supabase.from("products").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
              supabase.from("faqs").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
              supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
            ]);

            // Check if user is super_admin
            const { data: roleCheck } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", profile.user_id)
              .eq("role", "super_admin")
              .single();

            return {
              ...profile,
              product_count: prodRes.count || 0,
              faq_count: faqRes.count || 0,
              order_count: orderRes.count || 0,
              is_super_admin: !!roleCheck,
            };
          })
        );

        return new Response(JSON.stringify({ users: usersWithStats }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_user_details": {
        const { userId: detailUserId } = params;
        const [profileRes, productsRes, faqsRes, ordersRes, sessionsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", detailUserId).single(),
          supabase.from("products").select("*").eq("user_id", detailUserId),
          supabase.from("faqs").select("*, products(name)").eq("user_id", detailUserId),
          supabase.from("orders").select("*").eq("user_id", detailUserId).order("created_at", { ascending: false }),
          supabase.from("user_wsender_sessions").select("*").eq("user_id", detailUserId),
        ]);

        const staffRes = await supabase
          .from("staff_accounts")
          .select("*")
          .eq("owner_id", detailUserId)
          .order("created_at", { ascending: false });

        return new Response(JSON.stringify({
          profile: profileRes.data,
          products: productsRes.data || [],
          faqs: faqsRes.data || [],
          orders: ordersRes.data || [],
          sessions: sessionsRes.data || [],
          staff: staffRes.data || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_product": {
        const { userId: cpUserId, productData } = params;
        const { error } = await supabase.from("products").insert({
          ...productData,
          user_id: cpUserId,
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_product": {
        const { productId: upId, productData: upData } = params;
        const { error } = await supabase.from("products").update(upData).eq("id", upId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_product": {
        const { productId: dpId } = params;
        const { error } = await supabase.from("products").delete().eq("id", dpId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_faq": {
        const { userId: cfUserId, faqData } = params;
        const { error } = await supabase.from("faqs").insert({
          ...faqData,
          user_id: cfUserId,
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_faq": {
        const { faqId: ufId, faqData: ufData } = params;
        const { error } = await supabase.from("faqs").update(ufData).eq("id", ufId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_faq": {
        const { faqId: dfId } = params;
        const { error } = await supabase.from("faqs").delete().eq("id", dfId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_order": {
        const { orderId } = params;
        if (!orderId) return new Response(JSON.stringify({ error: "orderId required" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        const { error } = await supabase.from("orders").delete().eq("id", orderId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "change_password": {
        const { userId: cpwUserId, newPassword } = params;
        if (!cpwUserId || !newPassword) {
          return new Response(JSON.stringify({ error: "userId and newPassword required" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: pwError } = await supabase.auth.admin.updateUserById(cpwUserId, { password: newPassword });
        if (pwError) {
          console.error("Change password error:", pwError);
          return new Response(JSON.stringify({ error: pwError.message }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log(`Password changed for user ${cpwUserId} by admin ${caller.id}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_lead": {
        const { phoneNumber, userId: leadUserId } = params;
        if (!phoneNumber || !leadUserId) return new Response(JSON.stringify({ error: "phoneNumber and userId required" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        const { error } = await supabase.from("conversations").delete().eq("phone_number", phoneNumber).eq("user_id", leadUserId);
        if (error) return new Response(JSON.stringify({ error: error.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Admin manage users error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getPlanLimits(tier: string) {
  switch (tier) {
    case "enterprise":
      return { maxProducts: 999, maxFaqs: 999 };
    case "pro":
      return { maxProducts: 50, maxFaqs: 100 };
    case "free":
    default:
      return { maxProducts: 5, maxFaqs: 10 };
  }
}
