import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';

const PRODUCTION_API_URL = 'https://api.actorrise.com';
const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8000' : PRODUCTION_API_URL);

export interface SynthesizeOptions {
  text: string;
  voice?: string;
  instructions?: string;
}

/**
 * POST /api/speech/synthesize — same endpoint the web uses in
 * useOpenAITTS. Backend returns an MP3 blob. We persist it to the cache
 * directory and return the file URI so expo-audio can stream it.
 */
export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(new URL('/api/speech/synthesize', baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: opts.text,
      voice: opts.voice ?? 'coral',
      instructions: opts.instructions ?? '',
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`TTS synth failed: ${res.status} ${detail.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Cache directory unavailable');
  const filename = `${cacheDir}tts-${hashString(opts.text)}-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(filename, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return filename;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // React Native global btoa polyfill via Hermes
  // eslint-disable-next-line no-undef
  return globalThis.btoa(binary);
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
