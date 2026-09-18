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
    // We only accept POST for file uploads
    if (req.method !== "POST") {
      throw new Error("Method not allowed. Please use POST.");
    }

    // Ensure it's multipart/form-data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new Error("Invalid Content-Type. Please use multipart/form-data");
    }

    // Parse the form data
    const formData = await req.formData();
    const whatsappNumber = formData.get("whatsapp_number");
    const message = formData.get("message") || "";
    const file = formData.get("file") as File;

    if (!whatsappNumber) {
      throw new Error("whatsapp_number is required");
    }
    if (!file) {
      throw new Error("file is required");
    }

    // Initialize Supabase Admin client to bypass RLS for uploading
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename to prevent overwrites
    const fileExt = file.name ? file.name.split(".").pop() : "pdf";
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    console.log(`Uploading report for ${whatsappNumber}: ${fileName}`);

    // Upload to 'reports' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("reports")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from("reports").getPublicUrl(fileName);
    console.log(`File uploaded successfully: ${publicUrl}`);

    // Forward to existing send-whatsapp edge function
    const sendWhatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
    console.log(`Forwarding to WAHA via: ${sendWhatsappUrl}`);

    const authHeader = req.headers.get("authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

    const sendRes = await fetch(sendWhatsappUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: whatsappNumber,
        message: message,
        mediaUrl: publicUrl
      })
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("send-whatsapp error:", errText);
      throw new Error(`Failed to send WhatsApp message: ${errText}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Report sent successfully",
        file_url: publicUrl
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-report:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
