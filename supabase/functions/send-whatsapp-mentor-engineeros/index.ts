import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WAHA_BASE = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
const WAHA_KEY = Deno.env.get("WAHA_API_KEY") || "";

function detectMediaType(url: string): "image" | "video" | "audio" | "document" | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(lower)) return "image";
  if (/\.(mp4|mov|avi|webm|3gp|3gpp)(\?|$)/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|amr|opus)(\?|$)/.test(lower)) return "audio";
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt)(\?|$)/.test(lower)) return "document";
  return "image";
}

function toChatId(to: string): string {
  // Accept "+9477...", "9477...", "9477...@c.us", group "...@g.us", or a privacy "@lid" id
  if (!to) return "";
  if (to.includes("@")) return to;
  let digits = String(to).replace(/\D/g, "");
  if (!digits) return "";
  // If Sri Lankan local mobile number with leading 0 (e.g. 0740237915 -> 94740237915)
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = "94" + digits.slice(1);
  }
  // WhatsApp privacy identifiers are 15+ digits and are NOT phone numbers —
  // sending them as @c.us silently goes nowhere.
  if (digits.length >= 15) return `${digits}@lid`;
  return `${digits}@c.us`;
}

function decodeJwtPayload(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function resolveSessionName(
  explicitSession?: string,
  authHeader?: string | null
): Promise<string> {
  // 1. Explicitly provided non-default session
  if (explicitSession && explicitSession.trim() && explicitSession !== "default") {
    return explicitSession.trim();
  }

  // 2. Derive deterministic session from user's JWT
  if (authHeader) {
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const payload = decodeJwtPayload(token);
      const userId = payload?.sub;
      if (userId) {
        const derived = `u_${userId.replace(/-/g, "").substring(0, 20)}`;
        // Check if session exists in WAHA
        const chk = await fetch(`${WAHA_BASE}/api/sessions/${derived}`, {
          headers: { "X-Api-Key": WAHA_KEY, Accept: "application/json" },
        }).catch(() => null);
        if (chk && chk.ok) {
          return derived;
        }
      }
    } catch (e) {
      console.warn("Could not derive session from JWT:", e);
    }
  }

  // 3. Fallback: Query WAHA for any active WORKING session
  try {
    const listRes = await fetch(`${WAHA_BASE}/api/sessions?all=false`, {
      headers: { "X-Api-Key": WAHA_KEY, Accept: "application/json" },
    });
    if (listRes.ok) {
      const sessions = await listRes.json();
      if (Array.isArray(sessions) && sessions.length > 0) {
        const working = sessions.find((s: any) => s.status === "WORKING");
        if (working?.name) return working.name;
        if (sessions[0]?.name) return sessions[0].name;
      }
    }
  } catch (e) {
    console.warn("Could not query WAHA active sessions:", e);
  }

  return Deno.env.get("WAHA_DEFAULT_SESSION") || "default";
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "file";
    return last.split("?")[0];
  } catch {
    return "file";
  }
}

async function wahaFetch(path: string, body: any) {
  if (!WAHA_BASE) throw new Error("WAHA_BASE_URL not configured");
  return fetch(`${WAHA_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Api-Key": WAHA_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { to, message, sessionApiKey, sessionId, sessionName: customSession, imageUrl, mediaUrl, mediaType: explicitType } = body;

    if (!to || (!message && !imageUrl && !mediaUrl)) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' or 'message'/'mediaUrl' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("authorization");
    const rawSession = sessionApiKey || sessionId || customSession;
    const sessionName = await resolveSessionName(rawSession, authHeader);
    const chatId = toChatId(to);
    const url = mediaUrl || imageUrl;
    const detectedType = explicitType || (url ? detectMediaType(url) : null);

    console.log(`Sending WhatsApp via WAHA session=${sessionName} to=${chatId}${url ? ` (${detectedType})` : ""}: ${(message || "").substring(0, 60)}`);

    let res: Response;

    if (url) {
      // If media URL points to localhost:9000, rewrite to minio:9000 so WAHA can fetch it inside Docker network
      const wahaUrl = url.replace(/^http:\/\/(localhost|127\.0\.0\.1):9000\b/, "http://minio:9000");
      const fileName = filenameFromUrl(wahaUrl);
      const file = { url: wahaUrl, filename: fileName, mimetype: undefined as string | undefined };
      const caption = message || "";

      switch (detectedType) {
        case "video":
          res = await wahaFetch("/api/sendVideo", { session: sessionName, chatId, file, caption });
          break;
        case "audio":
          res = await wahaFetch("/api/sendVoice", { session: sessionName, chatId, file });
          break;
        case "document":
          res = await wahaFetch("/api/sendFile", { session: sessionName, chatId, file, caption });
          break;
        case "image":
        default:
          res = await wahaFetch("/api/sendImage", { session: sessionName, chatId, file, caption });
          break;
      }
    } else {
      res = await wahaFetch("/api/sendText", { session: sessionName, chatId, text: message });
    }

    const responseText = await res.text();
    console.log(`WAHA send response [${res.status}]: ${responseText.substring(0, 300)}`);

    if (!res.ok) {
      let parsed: any = null;
      try { parsed = JSON.parse(responseText); } catch { /* ignore */ }
      throw new Error(parsed?.message || parsed?.error || `WAHA send failed (${res.status}): ${responseText.substring(0, 200)}`);
    }

    let data: any = null;
    try { data = JSON.parse(responseText); } catch { /* ignore */ }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send WhatsApp error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
