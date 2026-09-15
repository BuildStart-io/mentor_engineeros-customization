import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ENDPOINT = (Deno.env.get("MINIO_ENDPOINT") || "").replace(/\/+$/, "");
const PUBLIC_URL = (Deno.env.get("MINIO_PUBLIC_URL") || ENDPOINT).replace(/\/+$/, "");
const REGION = Deno.env.get("MINIO_REGION") || "us-east-1";

const aws = new AwsClient({
  accessKeyId: Deno.env.get("MINIO_ACCESS_KEY") || "",
  secretAccessKey: Deno.env.get("MINIO_SECRET_KEY") || "",
  service: "s3",
  region: REGION,
});

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

async function ensureBucket(bucket: string) {
  const head = await aws.fetch(`${ENDPOINT}/${bucket}`, { method: "HEAD" });
  if (head.status === 404) {
    const created = await aws.fetch(`${ENDPOINT}/${bucket}`, { method: "PUT" });
    if (!created.ok && created.status !== 409) {
      throw new Error(`Bucket create failed (${created.status}): ${await created.text()}`);
    }
  } else if (!head.ok && head.status !== 403) {
    throw new Error(`Bucket check failed (${head.status})`);
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  const res = await aws.fetch(`${ENDPOINT}/${bucket}?policy=`, {
    method: "PUT",
    body: JSON.stringify(policy),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    console.warn(`Policy set failed for ${bucket} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Resolves the business owner id for the caller (staff resolve to their owner). */
async function resolveOwner(req: Request): Promise<{ ownerId: string; userId: string } | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getClaims(token);
  const userId = (data as any)?.claims?.sub;
  if (error || !userId) return null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
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
    if (!ENDPOINT) throw new Error("MINIO_ENDPOINT not configured");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "upload";

    const auth = await resolveOwner(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const ownedBuckets = [bucketFor(auth.ownerId), bucketFor(auth.ownerId, "faq")];

    if (action === "upload") {
      const form = await req.formData();
      const file = form.get("file");
      const folderRaw = String(form.get("folder") || "products");
      if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
      if (!ALLOWED_FOLDERS.includes(folderRaw)) return json({ error: "Invalid folder" }, 400);
      if (file.size > MAX_BYTES) return json({ error: "File exceeds 50MB limit" }, 400);

      const bucket = bucketFor(auth.ownerId, folderRaw);
      await ensureBucket(bucket);

      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      let key = "";
      if (ext === "pdf") {
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        key = `${folderRaw}/${safeName}`;
      } else {
        key = `${folderRaw}/${crypto.randomUUID()}.${ext}`;
      }
      const body = new Uint8Array(await file.arrayBuffer());

      const put = await aws.fetch(`${ENDPOINT}/${bucket}/${key}`, {
        method: "PUT",
        body,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) {
        const text = await put.text();
        console.error(`Upload failed [${put.status}]: ${text.slice(0, 300)}`);
        return json({ error: `Upload failed (${put.status})`, details: text.slice(0, 300) }, put.status);
      }

      const publicUrl = `${PUBLIC_URL}/${bucket}/${key}`;
      console.log(`Uploaded ${publicUrl} (${body.length} bytes)`);
      return json({ url: publicUrl, key, bucket });
    }

    if (action === "delete") {
      const { url: fileUrl } = await req.json();
      const owning = typeof fileUrl === "string"
        ? ownedBuckets.find((b) => fileUrl.startsWith(`${PUBLIC_URL}/${b}/`) || fileUrl.startsWith(`${ENDPOINT}/${b}/`))
        : undefined;
      if (!owning) {
        return json({ error: "Invalid or forbidden file URL" }, 400);
      }
      const prefix = fileUrl.startsWith(`${PUBLIC_URL}/`) ? `${PUBLIC_URL}/${owning}/` : `${ENDPOINT}/${owning}/`;
      const key = fileUrl.slice(prefix.length);
      const del = await aws.fetch(`${ENDPOINT}/${owning}/${key}`, { method: "DELETE" });
      if (!del.ok && del.status !== 404) {
        return json({ error: `Delete failed (${del.status})` }, del.status);
      }
      return json({ success: true });
    }

    if (action === "ensure-bucket") {
      const folder = url.searchParams.get("folder") || "products";
      const bucket = bucketFor(auth.ownerId, folder);
      await ensureBucket(bucket);
      return json({ success: true, bucket });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("media-storage error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
