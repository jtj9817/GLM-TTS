import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = join(THIS_DIR, "..", "..", "data");
export const AUDIO_DIR = join(DATA_DIR, "audio");

mkdirSync(AUDIO_DIR, { recursive: true });

export function extForMime(mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("flac")) return "flac";
  return "bin";
}

export function defaultFilename(id: string, ext: string): string {
  return `glmtts_${id}.${ext}`;
}

export function audioPathForId(id: string, ext: string): string {
  return join(AUDIO_DIR, `${id}.${ext}`);
}
