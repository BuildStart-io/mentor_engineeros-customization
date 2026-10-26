function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function transcribeAudio(sessionName: string, wahaMessageId: string, mediaUrl?: string): Promise<string | null> {
  const WAHA_BASE = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
  const WAHA_KEY = Deno.env.get("WAHA_API_KEY") || "";
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

  if (!OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not configured.");
    return null;
  }

  // 1. Download WAHA Audio
  let audioBuffer: Uint8Array;
  try {
    const wahaUrl = mediaUrl || `${WAHA_BASE}/api/${encodeURIComponent(sessionName)}/messages/${encodeURIComponent(wahaMessageId)}/download`;
    console.log(`Downloading audio from: ${wahaUrl}`);
    const res = await fetch(wahaUrl, {
      headers: { "X-Api-Key": WAHA_KEY, "Accept": "*/*" },
      signal: AbortSignal.timeout(15_000)
    });

    if (!res.ok) {
      console.error(`WAHA download failed (${res.status}): ${await res.text()}`);
      return null;
    }

    audioBuffer = new Uint8Array(await res.arrayBuffer());
    console.log(`Downloaded ${audioBuffer.length} bytes of audio data`);
  } catch (err) {
    console.error("Error downloading audio from WAHA:", err);
    return null;
  }

  // 2. Convert to Base64
  const base64Audio = bytesToBase64(audioBuffer);

  // 3. Send to OpenRouter (Gemini Multimodal Speech-to-Text)
  try {
    console.log("Sending to OpenRouter for audio transcription...");
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this audio verbatim in its native language/script (Sinhala, Tamil, English, or Singlish). Do NOT translate or summarize. Output ONLY the transcription."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:audio/ogg;base64,${base64Audio}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!orRes.ok) {
      console.error(`OpenRouter transcription failed (${orRes.status}): ${await orRes.text()}`);
      return null;
    }

    const orData = await orRes.json();
    const transcription = orData?.choices?.[0]?.message?.content?.trim();
    console.log("Transcription result:", transcription);
    return transcription || null;
  } catch (err) {
    console.error("Error transcribing audio:", err);
    return null;
  }
}
