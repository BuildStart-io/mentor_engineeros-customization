import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default Tenant: Mentor Engineers
const DEFAULT_USER_ID = "49ca4f34-135c-42e3-998a-4de001c493ab";
const DEFAULT_SESSION_ID = "u_49ca4f34135c42e3998a";

function normalizePhone(to: string): string {
  if (!to) return "";
  let digits = String(to).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = "94" + digits.slice(1);
  }
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "http://api-gw:8000";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: "mentor_engineeros_customization" },
    });

    // 1. Authentication Security: Env-configured secret or dynamic tenant session key
    const authHeaderIn = req.headers.get("authorization") || "";
    const token = authHeaderIn.replace(/^Bearer\s+/i, "").trim();
    const configuredSecret = Deno.env.get("SEND_REPORT_API_KEY") || "BqYyRuLErSkzhymBZmfGrTZhFPhdmX";

    let targetUserId = DEFAULT_USER_ID;
    let targetSessionId = DEFAULT_SESSION_ID;

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (token === configuredSecret) {
      // Legacy or configured global key maps to default tenant
      targetUserId = DEFAULT_USER_ID;
      targetSessionId = DEFAULT_SESSION_ID;
    } else {
      // Match against tenant's session_api_key in DB
      const { data: sessionData } = await supabase
        .from("user_wsender_sessions")
        .select("user_id, session_id")
        .eq("session_api_key", token)
        .maybeSingle();

      if (!sessionData) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid API Key" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      targetUserId = sessionData.user_id;
      targetSessionId = sessionData.session_id || `u_${sessionData.user_id.replace(/-/g, "").substring(0, 20)}`;
    }

    if (req.method !== "POST" && req.method !== "GET") {
      throw new Error("Method not allowed. Please use POST or GET.");
    }

    const url = new URL(req.url);
    let numbersRaw = url.searchParams.get("numbers") || url.searchParams.get("number") || "";
    let message = url.searchParams.get("message") || "";
    let documentUrl = url.searchParams.get("document_url") || url.searchParams.get("document") || url.searchParams.get("file_url") || url.searchParams.get("url") || url.searchParams.get("pdf_url") || "";
    const customSession = url.searchParams.get("sessionId") || url.searchParams.get("session_id");
    if (customSession) {
      targetSessionId = customSession;
    }

    // Parse body for POST requests
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        try {
          const formData = await req.formData();
          numbersRaw = formData.get("numbers")?.toString() || formData.get("number")?.toString() || numbersRaw;
          message = formData.get("message")?.toString() || message;
          documentUrl = formData.get("document_url")?.toString() || formData.get("document")?.toString() || formData.get("file_url")?.toString() || formData.get("url")?.toString() || formData.get("pdf_url")?.toString() || documentUrl;
          const bodySession = formData.get("sessionId")?.toString() || formData.get("session_id")?.toString();
          if (bodySession) targetSessionId = bodySession;
        } catch (e) {
          console.warn("Failed to parse form data:", e);
        }
      } else if (contentType.includes("application/json")) {
        try {
          const jsonData = await req.json();
          numbersRaw = jsonData.numbers || jsonData.number || numbersRaw;
          message = jsonData.message || message;
          documentUrl = jsonData.document_url || jsonData.document || jsonData.file_url || jsonData.url || jsonData.pdf_url || documentUrl;
          if (jsonData.sessionId || jsonData.session_id) targetSessionId = jsonData.sessionId || jsonData.session_id;
        } catch (e) {
          console.warn("Failed to parse JSON body:", e);
        }
      }
    }

    if (!numbersRaw) {
      throw new Error("number(s) are required. Please provide a phone number or a comma-separated list of numbers.");
    }

    // 2. Batch limit and normalization
    const parsedList = typeof numbersRaw === "string" 
      ? numbersRaw.split(",").map(n => n.trim()).filter(Boolean)
      : Array.isArray(numbersRaw) ? numbersRaw : [String(numbersRaw)];

    const numbersList = parsedList.map(n => normalizePhone(n)).filter(Boolean);

    if (numbersList.length === 0) {
      throw new Error("No valid phone numbers found in request.");
    }

    if (numbersList.length > 15) {
      throw new Error(`Batch limit exceeded: Maximum 15 numbers allowed per request (received ${numbersList.length}).`);
    }

    const urls = typeof documentUrl === "string" 
      ? documentUrl.split(",").map(u => u.trim()).filter(Boolean)
      : Array.isArray(documentUrl) ? documentUrl : [String(documentUrl)].filter(Boolean);

    if (!message && urls.length === 0) {
      throw new Error("Both message and document_url are missing. Cannot send an empty payload.");
    }

    // URL protocol validation
    for (const fileUrl of urls) {
      if (!/^https?:\/\//i.test(fileUrl)) {
        throw new Error(`Invalid URL format in document_url: ${fileUrl}. Must start with http:// or https://`);
      }
    }

    const sendWhatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp-mentor-engineeros`;
    const authHeader = `Bearer ${supabaseServiceKey}`;
    const results = [];

    // Loop through numbers and dispatch
    for (const whatsappNumber of numbersList) {
      try {
        console.log(`Sending report via session=${targetSessionId} to=${whatsappNumber}...`);

        if (urls.length === 0) {
          // Just send text message
          const payload = {
            to: whatsappNumber,
            message: message,
            sessionId: targetSessionId,
          };

          const sendRes = await fetch(sendWhatsappUrl, {
            method: "POST",
            headers: { "Authorization": authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!sendRes.ok) {
            throw new Error(`WAHA text failed: ${await sendRes.text()}`);
          }

          // 3. Audit trail: Log to conversations table
          try {
            await supabase.from("conversations").insert({
              phone_number: whatsappNumber,
              message: message,
              direction: "outbound",
              message_type: "text",
              metadata: { source: "external_send_report_api", session_id: targetSessionId },
              user_id: targetUserId,
            });
          } catch (logErr: any) {
            console.warn(`Failed to insert conversation audit log for ${whatsappNumber}:`, logErr.message);
          }

        } else {
          // Send media documents (attach message as caption to first file)
          for (let i = 0; i < urls.length; i++) {
            const fileUrl = urls[i];
            const caption = (i === 0 && message) ? message : "";
            const payload: any = {
              to: whatsappNumber,
              mediaUrl: fileUrl,
              sessionId: targetSessionId,
            };
            if (caption) {
              payload.message = caption;
            }

            const sendRes = await fetch(sendWhatsappUrl, {
              method: "POST",
              headers: { "Authorization": authHeader, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!sendRes.ok) {
              throw new Error(`WAHA media failed for file ${i + 1}: ${await sendRes.text()}`);
            }

            // 3. Audit trail: Log each media document to conversations table
            try {
              await supabase.from("conversations").insert({
                phone_number: whatsappNumber,
                message: caption || `Sent document: ${fileUrl}`,
                direction: "outbound",
                message_type: "document",
                metadata: {
                  source: "external_send_report_api",
                  media_url: fileUrl,
                  caption: caption || null,
                  session_id: targetSessionId,
                },
                user_id: targetUserId,
              });
            } catch (logErr: any) {
              console.warn(`Failed to insert media conversation audit log for ${whatsappNumber}:`, logErr.message);
            }

            // Small delay between multiple files
            if (i < urls.length - 1) {
              await new Promise(r => setTimeout(r, 600));
            }
          }
        }

        results.push({
          number: whatsappNumber,
          success: true,
        });

      } catch (err: any) {
        console.error(`Failed to send to ${whatsappNumber}:`, err.message);
        results.push({
          number: whatsappNumber,
          success: false,
          error: err.message,
        });
      }
    }

    const totalCount = results.length;
    const successCount = results.filter(r => r.success).length;
    const isOverallSuccess = successCount > 0;

    return new Response(
      JSON.stringify({ 
        success: isOverallSuccess, 
        message: `Processed ${totalCount} numbers. Sent successfully: ${successCount}, Failed: ${totalCount - successCount}`,
        details: results,
      }),
      { 
        status: isOverallSuccess ? 200 : 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("send-report global error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
