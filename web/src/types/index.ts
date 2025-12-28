// Shared TypeScript types for GLM-TTS Web Frontend

export type SampleMethod = "ras" | "topk";

export type PresetName =
  | "balanced"
  | "expressive"
  | "stable"
  | "ultra_stable"
  | "creative"
  | "fast"
  | "longform"
  | "pronunciation"
  | "low_repetition"
  | "sensual"
  | "asmr"
  | "custom";

export interface GenerationSettings {
  preset: PresetName;
  sample_method: SampleMethod;
  top_k: number;
  top_p: number;
  temperature: number;
  min_token_text_ratio: number;
  max_token_text_ratio: number;
  use_cache: boolean;
  use_phoneme: boolean;
}

export interface Generation {
  id: string;
  input_text: string;
  reference_text: string | null;
  seed: number | null;
  created_at: number;
  audio_mime: string;
  output_filename: string;
  audio_url: string;
  settings?: Partial<GenerationSettings>;
}

export interface ServerHealth {
  status: string;
  device: string;
  fp16: boolean;
  speaker_cache_size: number;
}

// IndexedDB Reference Audio Entry
export interface ReferenceAudioEntry {
  id: string;
  name: string;
  audioBlob: Blob;
  transcript: string;
  createdAt: number;
  duration?: number;
  waveform?: number[];
}

// Generation Config Entry (stored in IndexedDB)
export interface GenerationConfigEntry {
  id: string;
  name: string;
  description?: string;
  referenceText: string;
  inputText: string;
  referenceVoiceId?: string;      // Optional link to ReferenceAudioEntry
  referenceVoiceName?: string;    // Cached name for display
  settings?: Partial<GenerationSettings>;
  includeSettings: boolean;
  createdAt: number;
  updatedAt: number;
}

// Storage Info from backend
export interface StorageInfo {
  totalBytes: number;
  fileCount: number;
  dbBytes: number;
}

// Cleanup result from backend
export interface CleanupResult {
  deleted: number;
  bytesFreed: number;
}
