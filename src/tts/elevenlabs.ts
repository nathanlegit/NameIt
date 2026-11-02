// Adapter for ElevenLabs text-to-speech: the only place its API shapes live
// (PRD 10.3). Used for the demo clips' presenter narration and for the
// description voice (F11b). Meta offers no speech synthesis, so this is the
// one non-Meta model in the project.
//
// POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
// header xi-api-key, JSON body {text, model_id}, MP3 bytes back.

export const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

// Premade ElevenLabs voices (their "default voices" list).
export const PRESENTER_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";   // George: the demo clips' presenter
// Alice's id is from ElevenLabs' premade voice list, verified with this account on 2 Nov.
// Override with ELEVENLABS_DESCRIBER_VOICE_ID.
export const DESCRIBER_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";   // Alice: a different, clear voice for descriptions

export function requireElevenLabsKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set. Add it to .env.local, then re-run.");
  return apiKey;
}

export async function synthesise(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL_ID }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    const hint = response.status === 401 ? " (the key in .env.local was rejected: check or replace ELEVENLABS_API_KEY)" : "";
    throw new Error(`ElevenLabs returned HTTP ${response.status}${hint}: ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
