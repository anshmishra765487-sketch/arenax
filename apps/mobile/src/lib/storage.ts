// SDK 54+ moved the string/byte helpers to the legacy entry point.
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "./supabase";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Minimal base64 -> bytes decoder (avoids pulling in another native dep). */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let position = 0; position < clean.length; position += 1) {
    const value = BASE64_CHARS.indexOf(clean[position]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return output.subarray(0, index);
}

export interface UploadResult {
  path: string;
  publicUrl: string | null;
  error?: string;
}

/**
 * Uploads a local file (from image picker / camera) into a Supabase bucket.
 * Files are stored under `<uid>/...` which the storage policies enforce.
 */
export async function uploadLocalFile(input: {
  bucket: "evidence" | "clips" | "avatars";
  folder: string;
  filename: string;
  uri: string;
  contentType: string;
}): Promise<UploadResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(input.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const path = `${input.folder}/${input.filename}`;

    const { error } = await supabase.storage
      .from(input.bucket)
      .upload(path, bytes, { contentType: input.contentType, upsert: true });

    if (error) return { path, publicUrl: null, error: error.message };

    if (input.bucket === "evidence") {
      // Private bucket: use a long-lived signed URL for organizer review.
      const { data } = await supabase.storage.from(input.bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
      return { path, publicUrl: data?.signedUrl ?? null };
    }

    const { data } = supabase.storage.from(input.bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  } catch (error) {
    return {
      path: "",
      publicUrl: null,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/** Best-effort MIME guess for picker assets that omit it. */
export function guessContentType(uri: string, fallback: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return fallback;
}
