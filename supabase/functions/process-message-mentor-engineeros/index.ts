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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: 'mentor_engineeros_customization' } });

  let triggerSource = "cron";
  let triggerCorrelationId = "";
  try {
    const body = await req.json();
    triggerSource = body?.trigger || "cron";
    triggerCorrelationId = body?.correlationId || "";
  } catch { /* empty body from cron is fine */ }

  console.log(`[process-message] Triggered by: ${triggerSource}${triggerCorrelationId ? ` (corr: ${triggerCorrelationId})` : ""}`);

  // Step 1: Recover stale messages stuck in 'processing' for >2 minutes (crashed workers)
  const { data: staleRecovered } = await supabase
    .from("message_queue")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .select("id");

  if (staleRecovered && staleRecovered.length > 0) {
    console.log(`[process-message] Recovered ${staleRecovered.length} stale messages`);
  }

  // Step 2: Process messages in a loop
  let processedCount = 0;
  const maxIterations = 10; // Safety cap per invocation

  for (let i = 0; i < maxIterations; i++) {
    // Claim one pending message, enforcing per-user ordering:
    // Only pick from users who don't have another message currently processing.
    // We use a two-step approach since Supabase JS doesn't support FOR UPDATE SKIP LOCKED.
    
    // Find users currently processing
    const { data: busyUsers } = await supabase
      .from("message_queue")
      .select("user_id")
      .eq("status", "processing");

    const busyUserIds = (busyUsers || []).map((u: any) => u.user_id);

    // Find next pending message from a non-busy user
    let query = supabase
      .from("message_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(1);

    if (busyUserIds.length > 0) {
      // Exclude users with messages currently processing
      for (const uid of busyUserIds) {
        query = query.neq("user_id", uid);
      }
    }

    const { data: candidates, error: fetchError } = await query;

    if (fetchError) {
      console.error("[process-message] Queue fetch error:", fetchError);
      break;
    }

    if (!candidates || candidates.length === 0) {
      break; // No more work
    }

    const msg = candidates[0];
    const corrId = msg.correlation_id || triggerCorrelationId || msg.id.substring(0, 8);
    const timings: Record<string, number> = {};
    const mark = (label: string) => { timings[label] = Date.now(); };

    // Claim this message atomically
    mark("claim_start");
    const { data: claimed, error: claimError } = await supabase
      .from("message_queue")
      .update({ status: "processing", attempts: msg.attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", msg.id)
      .in("status", ["pending", "failed"])
      .select()
      .single();
    mark("claim_end");

    if (claimError || !claimed) {
      console.log(`[${corrId}] Message ${msg.id} already claimed, skipping`);
      continue;
    }

    try {
      await processMessage(supabase, supabaseUrl, supabaseServiceKey, msg, corrId, timings, mark);

      // Mark as done
      mark("done_start");
      await supabase
        .from("message_queue")
        .update({ status: "done", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", msg.id);
      mark("done_end");

      processedCount++;

      // Log timing breakdown
      const queueWaitMs = timings.claim_start - new Date(msg.created_at).getTime();
      console.log(`[${corrId}] ✅ Message ${msg.id} processed | queue_wait=${queueWaitMs}ms claim=${timings.claim_end - timings.claim_start}ms ai=${(timings.ai_end || 0) - (timings.ai_start || 0)}ms send=${(timings.send_end || 0) - (timings.send_start || 0)}ms total=${Date.now() - new Date(msg.created_at).getTime()}ms`);
    } catch (error) {
      const newStatus = msg.attempts + 1 >= msg.max_attempts ? "dead" : "failed";
      console.error(`[${corrId}] ❌ Message ${msg.id} failed (attempt ${msg.attempts + 1}/${msg.max_attempts} → ${newStatus}):`, error.message);
      await supabase
        .from("message_queue")
        .update({
          status: newStatus,
          error_message: error.message || String(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    }
  }

  console.log(`[process-message] Done. Processed ${processedCount} messages.`);

  return new Response(JSON.stringify({ processed: processedCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function processMessage(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  msg: any,
  corrId: string,
  timings: Record<string, number>,
  mark: (label: string) => void
) {
  const { user_id: userId, phone_number: phoneNumber, sender_name: senderName, message_text: messageText, message_type: messageType, session_api_key: sessionApiKey, raw_payload: body } = msg;

  // Check if this is a media message — if so, store it but do NOT reply
  const mediaTypes = ["image", "video", "audio", "document", "sticker", "ptt", "vcard", "location"];
  const isMediaMessage = mediaTypes.includes(messageType) || 
    (!messageText && messageType !== "text") ||
    (body?.data?.messages?.messageBody === undefined && body?.data?.messages?.message?.conversation === undefined && !messageText);

  // 1. Store the incoming message in conversations
  mark("store_inbound_start");
  const { error: insertError } = await supabase.from("conversations").insert({
    phone_number: phoneNumber,
    message: messageText,
    direction: "inbound",
    message_type: messageType,
    metadata: { senderName, event: body?.event, raw: body, correlationId: corrId },
    user_id: userId,
  });
  mark("store_inbound_end");

  if (insertError) {
    console.error(`[${corrId}] Error storing message:`, insertError);
  }

  // 1b. Contact billing: register this contact for the current cycle.
  // Every first inbound message from a contact counts, regardless of whether the AI replies.
  const contactCheck = await registerContact(supabase, userId, phoneNumber, corrId);
  if (contactCheck.blocked) {
    console.log(`[${corrId}] New-contact limit reached for user ${userId}, not serving ${phoneNumber}`);
    return;
  }
  // 1c. Growth plan: notify the owner when this contact becomes a qualified lead.
  await maybeNotifyQualifiedLead(
    supabase, supabaseUrl, supabaseServiceKey, userId, phoneNumber, senderName, sessionApiKey, corrId
  );


  // Skip replying to media messages (images, PDFs, videos, etc.)
  if (isMediaMessage) {
    console.log(`[${corrId}] Media message (type: ${messageType}) from ${phoneNumber}, stored but not replying`);
    return;
  }

  // 2. Check if auto-responses are enabled
  mark("settings_start");
  const { data: settingsData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "auto_responses")
    .eq("user_id", userId)
    .single();
  mark("settings_end");

  const autoResponsesEnabled = settingsData?.value?.enabled ?? true;

  if (!autoResponsesEnabled) {
    console.log(`[${corrId}] Auto responses disabled, skipping AI processing`);
    return;
  }

  // 3. Check if chat is taken over
  const { data: takeoverData } = await supabase
    .from("chat_takeovers")
    .select("is_taken_over")
    .eq("user_id", userId)
    .eq("phone_number", phoneNumber)
    .eq("is_taken_over", true)
    .maybeSingle();

  if (takeoverData) {
    console.log(`[${corrId}] Chat with ${phoneNumber} is taken over, skipping AI`);
    return;
  }

  // 4. Check if first message (for welcome message flow)
  const { count: convoCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", phoneNumber)
    .eq("user_id", userId);

  const isFirstMessage = (convoCount || 0) <= 1;

  if (isFirstMessage) {
    const sent = await handleWelcomeMessage(supabase, supabaseUrl, supabaseServiceKey, userId, phoneNumber, messageText, sessionApiKey, corrId, timings, mark);
    if (sent) return;
  }

  // 5. Get conversation history
  mark("history_start");
  const { data: conversationHistory } = await supabase
    .from("conversations")
    .select("message, direction, created_at")
    .eq("phone_number", phoneNumber)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  mark("history_end");

  // 6. Call AI chat with timeout
  mark("ai_start");
  const controller = new AbortController();
  const aiTimeout = setTimeout(() => controller.abort(), 55_000); // 55s timeout (edge function limit ~60s)

  let aiResponse: Response;
  try {
    aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat-mentor-engineeros`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: messageText,
        phoneNumber,
        senderName,
        conversationHistory: conversationHistory?.reverse() || [],
        userId,
        sessionApiKey,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(aiTimeout);
    mark("ai_end");
    if (err.name === "AbortError") {
      throw new Error("AI call timed out after 55s");
    }
    throw err;
  }
  clearTimeout(aiTimeout);
  mark("ai_end");

  const aiData = await aiResponse.json();

  if (!aiResponse.ok) {
    // Handle limit/paused fallback messages
    if ((aiResponse.status === 429 || aiResponse.status === 403) && aiData.response) {
      console.log(`[${corrId}] AI limit/paused (${aiResponse.status}), sending fallback`);
      await supabase.from("conversations").insert({
        phone_number: phoneNumber,
        message: aiData.response,
        direction: "outbound",
        message_type: "text",
        user_id: userId,
      });

      mark("send_start");
      await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, aiData.response, null, sessionApiKey);
      mark("send_end");
      return;
    }

    console.error(`[${corrId}] AI chat error:`, JSON.stringify(aiData));
    throw new Error("AI processing failed");
  }

  const replyMessage = aiData.response;
  const replyImageUrl = aiData.imageUrl || null;
  const replyVideoUrl = aiData.videoUrl || null;
  const followupMessage = aiData.followupMessage || null;
  const faqMedia: string[] = Array.isArray(aiData.faqMedia) ? aiData.faqMedia : [];
  console.log(`[${corrId}] AI reply: ${replyMessage?.substring(0, 100)}${replyImageUrl ? " (with image)" : ""}${replyVideoUrl ? " (with video)" : ""}${followupMessage ? " (with followup)" : ""}`);

  // 7. Store outgoing message
  mark("store_outbound_start");
  await supabase.from("conversations").insert({
    phone_number: phoneNumber,
    message: replyMessage,
    direction: "outbound",
    message_type: replyImageUrl ? "image" : "text",
    metadata: { correlationId: corrId, ...(faqMedia.length > 0 ? { faqMedia } : {}) },
    user_id: userId,
  });
  mark("store_outbound_end");

  // 8. Send reply via WhatsApp: video first, then images, then text
  mark("send_start");

  // Send video first if present
  if (replyVideoUrl) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, replyVideoUrl, sessionApiKey);
  }

  // Send image(s) next if present
  if (replyImageUrl) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, replyImageUrl, sessionApiKey);
  }

  // Send FAQ attachments (images / videos / PDFs) with no caption, before the text reply
  for (const url of faqMedia) {
    await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, url, sessionApiKey);
  }

  // Send text message last
  await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, replyMessage, null, sessionApiKey);

  // Send order follow-up message if present
  if (followupMessage) {
    console.log(`[${corrId}] Sending order follow-up message`);
    await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, followupMessage, null, sessionApiKey);
    // Store follow-up in conversation history
    await supabase.from("conversations").insert({
      phone_number: phoneNumber,
      message: followupMessage,
      direction: "outbound",
      message_type: "text",
      metadata: { type: "order_followup", correlationId: corrId },
      user_id: userId,
    });
  }

  mark("send_end");
}

async function handleWelcomeMessage(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
  phoneNumber: string,
  messageText: string,
  sessionApiKey: string,
  corrId: string,
  timings: Record<string, number>,
  mark: (label: string) => void
): Promise<boolean> {
  const { data: welcomeSettings } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "welcome_message")
    .eq("user_id", userId)
    .single();

  // Check bypass triggers
  const bypassTriggers: string[] = welcomeSettings?.value?.bypass_triggers || [];
  const msgLower = messageText.toLowerCase();
  const shouldBypass = bypassTriggers.length > 0 && bypassTriggers.some((t: string) => msgLower.includes(t));

  if (shouldBypass) {
    console.log(`[${corrId}] Bypass trigger matched, skipping welcome`);
    return false;
  }

  const welcomeText: string = welcomeSettings?.value?.text || "";
  const welcomeMediaUrls: string[] = welcomeSettings?.value?.media_urls || [];
  const singleMedia = welcomeSettings?.value?.media_url;
  if (singleMedia && !welcomeMediaUrls.includes(singleMedia)) {
    welcomeMediaUrls.unshift(singleMedia);
  }

  const welcomeSequence: Array<{ type: string; url?: string }> = welcomeSettings?.value?.welcome_sequence || [];

  mark("send_start");
  if (welcomeSequence.length > 0) {
    for (const seqItem of welcomeSequence) {
      if (seqItem.type === "text" && welcomeText.trim()) {
        console.log(`[${corrId}] Sending welcome text (sequence)`);
        await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, welcomeText, null, sessionApiKey);
      } else if (seqItem.type === "media" && seqItem.url) {
        console.log(`[${corrId}] Sending welcome media (sequence): ${seqItem.url.substring(0, 80)}`);
        await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, seqItem.url, sessionApiKey);
      }
    }
  } else {
    if (welcomeText.trim()) {
      await sendWhatsApp(supabaseUrl, supabaseServiceKey, phoneNumber, welcomeText, null, sessionApiKey);
    }
    for (const mediaUrl of welcomeMediaUrls) {
      await sendWhatsAppMedia(supabaseUrl, supabaseServiceKey, phoneNumber, mediaUrl, sessionApiKey);
    }
  }
  mark("send_end");

  if (welcomeText.trim()) {
    await supabase.from("conversations").insert({
      phone_number: phoneNumber,
      message: welcomeText,
      direction: "outbound",
      message_type: "text",
      metadata: { type: "welcome_message", correlationId: corrId },
      user_id: userId,
    });
    console.log(`[${corrId}] Stored welcome message in conversation history`);
  }

  console.log(`[${corrId}] Welcome message sent, skipping AI for first message`);
  return true;
}

async function sendWhatsApp(
  supabaseUrl: string,
  supabaseServiceKey: string,
  to: string,
  message: string,
  imageUrl: string | null,
  sessionApiKey: string
) {
  const body: any = { to, message, sessionApiKey };
  if (imageUrl) body.imageUrl = imageUrl;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-mentor-engineeros`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Send WhatsApp error:", errText);
    throw new Error(`Send WhatsApp failed: ${errText.substring(0, 200)}`);
  } else {
    console.log("Reply sent successfully");
  }
}

async function sendWhatsAppMedia(
  supabaseUrl: string,
  supabaseServiceKey: string,
  to: string,
  mediaUrl: string,
  sessionApiKey: string
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-mentor-engineeros`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, mediaUrl, sessionApiKey }),
  });

  if (!res.ok) {
    console.error("Send media error:", await res.text());
  } else {
    console.log("Media sent:", mediaUrl.substring(0, 80));
  }
}

/** Normalize a WhatsApp identifier to a stable contact key (digits only). */
export function normalizeContactKey(raw: string): string {
  return String(raw || "").split("@")[0].replace(/\D/g, "");
}

/** Start of the current billing cycle for a profile. */
export function cycleStart(billingCycleStart: string | null | undefined): string {
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

/**
 * Registers an inbound contact against the current billing cycle.
 * Returns blocked=true only when this is a NEW contact and the plan's
 * contact allowance is exhausted — already-counted contacts keep being served.
 */
async function registerContact(supabase: any, userId: string, phoneNumber: string, corrId: string) {
  try {
    const key = normalizeContactKey(phoneNumber);
    if (!key) return { blocked: false, isNew: false };

    const { data: profile } = await supabase
      .from("profiles")
      .select("billing_cycle_start, addon_contacts, plan_tier")
      .eq("user_id", userId)
      .single();

    const periodStart = cycleStart(profile?.billing_cycle_start);

    const { data: existing } = await supabase
      .from("contact_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("phone_number", key)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing) return { blocked: false, isNew: false };

    // New contact — enforce the allowance before counting them in.
    const { data: platformLimits } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "plan_limits")
      .single();

    const tier = profile?.plan_tier || "free";
    const tierLimits = platformLimits?.value?.[tier] || {};
    const limit = (tierLimits.contacts_per_month || 50) + (profile?.addon_contacts || 0);

    const { data: used } = await supabase.rpc("get_contact_usage", {
      _user_id: userId,
      _since: periodStart,
    });

    if ((used || 0) >= limit) {
      console.log(`[${corrId}] Contact limit ${used}/${limit} reached for user ${userId}`);
      return { blocked: true, isNew: true };
    }

    await supabase
      .from("contact_usage")
      .insert({ user_id: userId, phone_number: key, period_start: periodStart });

    console.log(`[${corrId}] New contact registered (${(used || 0) + 1}/${limit})`);
    return { blocked: false, isNew: true };
  } catch (e) {
    console.error(`[${corrId}] registerContact failed:`, e);
    return { blocked: false, isNew: false };
  }
}

/**
 * Growth-plan only: when a contact crosses the qualified-lead threshold
 * (6 inbound messages), send a plain (non-AI) WhatsApp alert to the owner
 * number configured in Settings → Chatbot → Order Notifications.
 * Fires exactly once, on the 6th inbound message.
 */
async function maybeNotifyQualifiedLead(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
  phoneNumber: string,
  senderName: string | null,
  sessionApiKey: string | null,
  corrId: string
) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.plan_tier !== "enterprise") return;

    const { count: inboundCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("phone_number", phoneNumber)
      .eq("direction", "inbound");

    if ((inboundCount || 0) !== 6) return; // only the moment they qualify

    const { data: notifSettings } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "order_notifications")
      .eq("user_id", userId)
      .maybeSingle();

    const ownerPhone = notifSettings?.value?.phone;
    if (!ownerPhone) return;

    const { data: lastMsgs } = await supabase
      .from("conversations")
      .select("message, created_at")
      .eq("user_id", userId)
      .eq("phone_number", phoneNumber)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(3);

    const messages = (lastMsgs || [])
      .slice()
      .reverse()
      .map((m: any) => `• ${String(m.message || "").substring(0, 300)}`)
      .join("\n");

    const displayPhone = String(phoneNumber || "").split("@")[0];
    const message = `🌟 QUALIFIED LEAD\n👤 ${senderName || "Unknown"}\n📱 ${displayPhone}\n\n🗨️ Last 3 messages:\n${messages}`;

    let sendApiKey = sessionApiKey || null;
    if (!sendApiKey) {
      const { data: sessionData } = await supabase
        .from("user_wsender_sessions")
        .select("session_api_key")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sendApiKey = sessionData?.session_api_key || null;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-mentor-engineeros`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: ownerPhone, message, sessionApiKey: sendApiKey }),
    });
    if (!res.ok) {
      console.error(`[${corrId}] Lead notification failed:`, (await res.text()).substring(0, 200));
    } else {
      console.log(`[${corrId}] Qualified lead notification sent to ${ownerPhone}`);
    }
  } catch (e) {
    console.error(`[${corrId}] maybeNotifyQualifiedLead failed:`, (e as Error).message);
  }
}
