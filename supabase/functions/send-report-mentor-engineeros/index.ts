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
    if (req.method !== "POST" && req.method !== "GET") {
      throw new Error("Method not allowed. Please use POST or GET.");
    }

    const url = new URL(req.url);
    let numbersRaw = url.searchParams.get("numbers") || url.searchParams.get("number") || "";
    let message = url.searchParams.get("message") || "";
    let documentUrl = url.searchParams.get("document_url") || url.searchParams.get("document") || url.searchParams.get("file_url") || "";

    // If POST, also try parsing FormData or JSON just in case they send it in the body
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        try {
          const formData = await req.formData();
          numbersRaw = formData.get("numbers")?.toString() || formData.get("number")?.toString() || numbersRaw;
          message = formData.get("message")?.toString() || message;
          documentUrl = formData.get("document_url")?.toString() || formData.get("document")?.toString() || formData.get("file_url")?.toString() || documentUrl;
        } catch (e) {
          console.warn("Failed to parse form data:", e);
        }
      } else if (contentType.includes("application/json")) {
        try {
          const jsonData = await req.json();
          numbersRaw = jsonData.numbers || jsonData.number || numbersRaw;
          message = jsonData.message || message;
          documentUrl = jsonData.document_url || jsonData.document || jsonData.file_url || documentUrl;
        } catch (e) {
          console.warn("Failed to parse JSON body:", e);
        }
      }
    }

    if (!numbersRaw) {
      throw new Error("number(s) are required. Please provide a phone number or a comma-separated list of numbers.");
    }

    // Split numbers by comma, remove whitespace, and filter empty strings
    let numbersList = typeof numbersRaw === "string" 
      ? numbersRaw.split(",").map(n => n.trim()).filter(Boolean)
      : Array.isArray(numbersRaw) ? numbersRaw : [String(numbersRaw)];

    if (numbersList.length === 0) {
      throw new Error("No valid numbers provided.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sendWhatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp-mentor-engineeros`;
    const authHeader = req.headers.get("authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

    const results = [];

    // Loop through all numbers and send the message/document
    for (const whatsappNumber of numbersList) {
      try {
        console.log(`Sending to WAHA for ${whatsappNumber}...`);
        
        const payload: any = {
          to: whatsappNumber
        };
        
        if (message) payload.message = message;
        if (documentUrl) payload.mediaUrl = documentUrl;
        
        // If neither message nor document is provided
        if (!message && !documentUrl) {
          throw new Error("Both message and document_url are missing. Cannot send an empty message.");
        }

        const sendRes = await fetch(sendWhatsappUrl, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!sendRes.ok) {
          const errText = await sendRes.text();
          throw new Error(`WAHA integration failed: ${errText}`);
        }

        results.push({
          number: whatsappNumber,
          success: true
        });

      } catch (err: any) {
        console.error(`Failed to send to ${whatsappNumber}:`, err.message);
        results.push({
          number: whatsappNumber,
          success: false,
          error: err.message
        });
        // We DO NOT throw here, we just continue to the next number
      }
    }

    // Calculate overall success
    const totalCount = results.length;
    const successCount = results.filter(r => r.success).length;
    const isOverallSuccess = successCount > 0;

    return new Response(
      JSON.stringify({ 
        success: isOverallSuccess, 
        message: `Processed ${totalCount} numbers. Sent successfully: ${successCount}, Failed: ${totalCount - successCount}`,
        details: results
      }),
      { 
        status: isOverallSuccess ? 200 : 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
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
