import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_FOLDERS = ["products", "videos", "welcome", "faq"];
const MAX_BYTES = 50 * 1024 * 1024;

/** FAQ attachments live in their own dedicated bucket, separate from product/welcome media. */
function bucketFor(ownerId: string, folder?: string) {
  return folder === "faq" ? `faqmedia-${ownerId}` : `biz-${ownerId}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureBucket(admin: any, bucket: string) {
  const { data: bData, error: bErr } = await admin.storage.getBucket(bucket);
  if (bErr || !bData) {
    const { error: createErr } = await admin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: MAX_BYTES,
    });
    if (createErr) {
      console.warn(`Bucket creation issue for ${bucket}:`, createErr.message);
    }
  }
}

/** Resolves the business owner id for the caller (staff resolve to their owner). */
async function resolveOwner(req: Request): Promise<{ ownerId: string; userId: string } | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'mentor_engineeros_customization' } });
  const { data, error } = await authClient.auth.getClaims(token);
  const userId = (data as any)?.claims?.sub;
  if (error || !userId) return null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'mentor_engineeros_customization' } });
  const { data: staff } = await admin
    .from("staff_accounts")
    .select("owner_id")
    .eq("staff_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  return { ownerId: staff?.owner_id || userId, userId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "upload";

    const auth = await resolveOwner(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'mentor_engineeros_customization' } });
    const ownedBuckets = [bucketFor(auth.ownerId), bucketFor(auth.ownerId, "faq")];

    if (action === "upload") {
      const form = await req.formData();
      const file = form.get("file");
      const folderRaw = String(form.get("folder") || "products");
      if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
      if (!ALLOWED_FOLDERS.includes(folderRaw)) return json({ error: "Invalid folder" }, 400);
      if (file.size > MAX_BYTES) return json({ error: "File exceeds 50MB limit" }, 400);

      const bucket = bucketFor(auth.ownerId, folderRaw);
      await ensureBucket(admin, bucket);

      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      let key = "";
      if (ext === "pdf") {
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        key = `${folderRaw}/${safeName}`;
      } else {
        key = `${folderRaw}/${crypto.randomUUID()}.${ext}`;
      }
      
      const body = await file.arrayBuffer();
      
      let mimeType = file.type || "application/octet-stream";
      if (!mimeType || mimeType === "application/octet-stream") {
        if (ext === "mp4") mimeType = "video/mp4";
        else if (ext === "webm") mimeType = "video/webm";
        else if (ext === "mov") mimeType = "video/quicktime";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "webp") mimeType = "image/webp";
      }
      
      const { data: uploadData, error: uploadError } = await admin.storage
        .from(bucket)
        .upload(key, body, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error(`Upload failed: ${uploadError.message}`);
        return json({ error: `Upload failed`, details: uploadError.message }, 400);
      }

      const { data: publicData } = admin.storage.from(bucket).getPublicUrl(key);
      const publicUrl = publicData.publicUrl.replace(
        SUPABASE_URL,
        "https://supabase.buildstart.io"
      );
      console.log(`Uploaded ${publicUrl} (${body.byteLength} bytes)`);
      
      return json({ url: publicUrl, key, bucket });
    }

    if (action === "delete") {
      const { url: fileUrl } = await req.json();
      
      // Attempt to extract bucket and key from the Supabase public URL
      let owningBucket = "";
      let owningKey = "";
      
      for (const b of ownedBuckets) {
        const marker = `/storage/v1/object/public/${b}/`;
        if (typeof fileUrl === "string" && fileUrl.includes(marker)) {
          owningBucket = b;
          owningKey = fileUrl.split(marker)[1];
          break;
        }
      }
      
      if (!owningBucket || !owningKey) {
         return json({ error: "Invalid or forbidden file URL" }, 400);
      }
      
      const { error: delError } = await admin.storage.from(owningBucket).remove([owningKey]);
      if (delError) {
        return json({ error: `Delete failed`, details: delError.message }, 400);
      }
      return json({ success: true });
    }

    if (action === "ensure-bucket") {
      const folder = url.searchParams.get("folder") || "products";
      const bucket = bucketFor(auth.ownerId, folder);
      await ensureBucket(admin, bucket);
      return json({ success: true, bucket });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("media-storage error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
