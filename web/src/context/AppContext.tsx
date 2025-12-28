import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useReferenceAudioDB, getAudioDuration } from "../hooks/useIndexedDB";
import { useQueue } from "../hooks/useQueue";
import { useAudioConverter } from "../hooks/useAudioConverter";
import type {
  Generation,
  GenerationSettings,
  ReferenceAudioEntry,
  ServerHealth,
  SampleMethod,
} from "../types";

const API_BASE = "";
const SETTINGS_STORAGE_KEY = "glmtts_settings_v1";

// Preset definitions
export const PRESET_BALANCED: GenerationSettings = {
  preset: "balanced",
  sample_method: "ras",
  top_k: 25,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_EXPRESSIVE: GenerationSettings = {
  preset: "expressive",
  sample_method: "ras",
  top_k: 35,
  top_p: 0.85,
  temperature: 1.05,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_STABLE: GenerationSettings = {
  preset: "stable",
  sample_method: "topk",
  top_k: 15,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_ULTRA_STABLE: GenerationSettings = {
  preset: "ultra_stable",
  sample_method: "topk",
  top_k: 8,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_CREATIVE: GenerationSettings = {
  preset: "creative",
  sample_method: "ras",
  top_k: 50,
  top_p: 0.9,
  temperature: 1.2,
  min_token_text_ratio: 2,
  max_token_text_ratio: 22,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_FAST: GenerationSettings = {
  preset: "fast",
  sample_method: "ras",
  top_k: 20,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 1.5,
  max_token_text_ratio: 12,
  use_cache: false,
  use_phoneme: false,
};

export const PRESET_LONGFORM: GenerationSettings = {
  preset: "longform",
  sample_method: "ras",
  top_k: 30,
  top_p: 0.85,
  temperature: 1.05,
  min_token_text_ratio: 2,
  max_token_text_ratio: 30,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_PRONUNCIATION: GenerationSettings = {
  preset: "pronunciation",
  sample_method: "ras",
  top_k: 25,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: true,
};

export const PRESET_LOW_REPETITION: GenerationSettings = {
  preset: "low_repetition",
  sample_method: "ras",
  top_k: 30,
  top_p: 0.75,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_SENSUAL: GenerationSettings = {
  preset: "sensual",
  sample_method: "ras",
  top_k: 35,
  top_p: 0.9,
  temperature: 1.1,
  min_token_text_ratio: 2,
  max_token_text_ratio: 22,
  use_cache: true,
  use_phoneme: false,
};

export const PRESET_ASMR: GenerationSettings = {
  preset: "asmr",
  sample_method: "ras",
  top_k: 45,
  top_p: 0.92,
  temperature: 1.25,
  min_token_text_ratio: 2.8,
  max_token_text_ratio: 28,
  use_cache: true,
  use_phoneme: true,
};

export const PRESET_DESCRIPTIONS: Record<GenerationSettings["preset"], string> = {
  balanced: "Best all-round default. Good stability with natural variation.",
  expressive: "Adds controlled emotion and dynamics without going wild.",
  stable: "Lower variance for steadier, more predictable delivery.",
  ultra_stable: "Most deterministic output. Great for consistency.",
  creative: "Higher variation for more expressive, surprising takes.",
  fast: "Shorter outputs and quicker processing at the cost of richness.",
  longform: "Better continuity for long passages and narration.",
  pronunciation: "Enables phoneme input for precise pronunciation control.",
  low_repetition: "Reduces loops and repeated phrases in output.",
  sensual: "Warmer, breathier tone with softer dynamics.",
  asmr: "Intimate, close-mic style with delicate articulation.",
  custom: "Manual settings override. Adjust the controls below.",
};

export const PRESET_VALUES: Record<GenerationSettings["preset"], GenerationSettings> = {
  balanced: PRESET_BALANCED,
  expressive: PRESET_EXPRESSIVE,
  stable: PRESET_STABLE,
  ultra_stable: PRESET_ULTRA_STABLE,
  creative: PRESET_CREATIVE,
  fast: PRESET_FAST,
  longform: PRESET_LONGFORM,
  pronunciation: PRESET_PRONUNCIATION,
  low_repetition: PRESET_LOW_REPETITION,
  sensual: PRESET_SENSUAL,
  asmr: PRESET_ASMR,
  custom: PRESET_BALANCED,
};

// Utility functions
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeSettings(input: GenerationSettings): GenerationSettings {
  const top_k = Math.floor(clamp(input.top_k, 1, 200));
  const top_p = clamp(input.top_p, 0.01, 1.0);
  const temperature = clamp(input.temperature, 0.1, 2.0);
  const min_token_text_ratio = clamp(input.min_token_text_ratio, 0.5, 50);
  const max_token_text_ratio = clamp(input.max_token_text_ratio, 0.5, 50);
  return {
    ...input,
    top_k,
    top_p,
    temperature,
    min_token_text_ratio: Math.min(min_token_text_ratio, max_token_text_ratio),
    max_token_text_ratio: Math.max(min_token_text_ratio, max_token_text_ratio),
  };
}

export function estimateGenerationTime(text: string, settings: GenerationSettings): number {
  const charCount = text.length;
  if (charCount === 0) return 0;
  const avgTokenTextRatio = (settings.min_token_text_ratio + settings.max_token_text_ratio) / 2;
  const estimatedTokens = charCount * avgTokenTextRatio;
  const tokensPerSecond = 80;
  const llmSeconds = estimatedTokens / tokensPerSecond;
  const flowSeconds = 5;
  return Math.ceil(llmSeconds + flowSeconds + 2);
}

export function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// Now Playing state
interface NowPlaying {
  id: string;
  type: "output" | "reference";
  audioUrl: string;
  title: string;
  duration?: number;
}

// Context interface
interface AppContextType {
  // API base
  apiBase: string;

  // Server status
  serverStatus: ServerHealth | null;
  statusChecked: boolean;
  checkServerHealth: () => Promise<void>;

  // Settings
  settings: GenerationSettings;
  setSettings: (settings: GenerationSettings) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Reference audio (current)
  referenceAudio: File | null;
  referenceAudioUrl: string | null;
  referenceText: string;
  setReferenceAudio: (file: File | null) => void;
  setReferenceText: (text: string) => void;
  loadReferenceFromLibrary: (entry: ReferenceAudioEntry) => void;

  // Reference library (IndexedDB)
  referenceLibrary: ReferenceAudioEntry[];
  refreshReferenceLibrary: () => Promise<void>;
  saveToLibrary: (name: string) => Promise<void>;
  deleteFromLibrary: (id: string) => Promise<void>;
  updateLibraryEntry: (entry: ReferenceAudioEntry) => Promise<void>;
  dbReady: boolean;

  // Generations
  generations: Generation[];
  refreshGenerations: () => Promise<void>;
  deleteGeneration: (id: string) => Promise<void>;

  // Synthesis
  synthesize: (text: string, seed: number) => Promise<Generation>;
  isLoading: boolean;

  // Queue
  queue: ReturnType<typeof useQueue>["queue"];
  isQueueProcessing: boolean;
  currentItem: ReturnType<typeof useQueue>["currentItem"];
  addToQueue: ReturnType<typeof useQueue>["addToQueue"];
  removeFromQueue: ReturnType<typeof useQueue>["removeFromQueue"];
  clearCompleted: ReturnType<typeof useQueue>["clearCompleted"];
  clearAll: ReturnType<typeof useQueue>["clearAll"];
  processQueue: () => Promise<void>;
  retryFailed: ReturnType<typeof useQueue>["retryFailed"];

  // Audio conversion
  ffmpegLoaded: boolean;
  ffmpegLoading: boolean;
  convertToMP3: (url: string) => Promise<Blob>;
  convertToFLAC: (url: string) => Promise<Blob>;
  convertToOGG: (url: string) => Promise<Blob>;

  // Now playing (for mini player)
  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  playAudio: (id: string, type: "output" | "reference", audioUrl: string, title: string, duration?: number) => void;
  pauseAudio: () => void;
  resumeAudio: () => void;
  stopAudio: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;

  // Error handling
  error: string | null;
  setError: (error: string | null) => void;

  // Export handling
  exportingId: string | null;
  exportGeneration: (gen: Generation) => Promise<void>;

  // Waveform preference
  waveformEnabled: boolean;
  setWaveformEnabled: (enabled: boolean) => void;

  // Format conversion
  selectedFormat: "wav" | "mp3" | "flac" | "ogg";
  setSelectedFormat: (format: "wav" | "mp3" | "flac" | "ogg") => void;
  convertingId: string | null;
  convertAndDownload: (gen: Generation, format: "mp3" | "flac" | "ogg") => Promise<void>;

  // Cache
  clearCache: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // Server status
  const [serverStatus, setServerStatus] = useState<ServerHealth | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettingsState] = useState<GenerationSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return PRESET_BALANCED;
      const parsed = JSON.parse(raw) as Partial<GenerationSettings>;
      const merged: GenerationSettings = {
        ...PRESET_BALANCED,
        ...parsed,
        preset: (parsed.preset as GenerationSettings["preset"]) ?? "balanced",
        sample_method: (parsed.sample_method as SampleMethod) ?? "ras",
      };
      return normalizeSettings(merged);
    } catch {
      return PRESET_BALANCED;
    }
  });

  const setSettings = useCallback((newSettings: GenerationSettings) => {
    const normalized = normalizeSettings(newSettings);
    setSettingsState(normalized);
  }, []);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Reference audio
  const [referenceAudio, setReferenceAudioState] = useState<File | null>(null);
  const [referenceAudioUrl, setReferenceAudioUrl] = useState<string | null>(null);
  const [referenceText, setReferenceText] = useState("");

  const setReferenceAudio = useCallback((file: File | null) => {
    setReferenceAudioState(file);
    if (file) {
      const nextUrl = URL.createObjectURL(file);
      setReferenceAudioUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
    } else {
      setReferenceAudioUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, []);

  // Cleanup URL on unmount
  useEffect(() => {
    return () => {
      if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
    };
  }, [referenceAudioUrl]);

  // Reference library (IndexedDB)
  const { saveAudio, listAudio, deleteAudio, ready: dbReady } = useReferenceAudioDB();
  const [referenceLibrary, setReferenceLibrary] = useState<ReferenceAudioEntry[]>([]);

  const refreshReferenceLibrary = useCallback(async () => {
    if (!dbReady) return;
    try {
      const audios = await listAudio();
      setReferenceLibrary(audios);
    } catch (err) {
      console.error("Failed to load reference audios:", err);
    }
  }, [dbReady, listAudio]);

  useEffect(() => {
    refreshReferenceLibrary();
  }, [refreshReferenceLibrary]);

  const saveToLibrary = useCallback(async (name: string) => {
    if (!referenceAudio || !dbReady) return;
    const duration = await getAudioDuration(referenceAudio).catch(() => undefined);
    await saveAudio({
      id: crypto.randomUUID(),
      name: name.trim(),
      audioBlob: referenceAudio,
      transcript: referenceText,
      createdAt: Date.now(),
      duration,
    });
    await refreshReferenceLibrary();
  }, [referenceAudio, referenceText, dbReady, saveAudio, refreshReferenceLibrary]);

  const deleteFromLibrary = useCallback(async (id: string) => {
    await deleteAudio(id);
    await refreshReferenceLibrary();
  }, [deleteAudio, refreshReferenceLibrary]);

  const updateLibraryEntry = useCallback(async (entry: ReferenceAudioEntry) => {
    await saveAudio(entry);
    await refreshReferenceLibrary();
  }, [saveAudio, refreshReferenceLibrary]);

  const loadReferenceFromLibrary = useCallback((entry: ReferenceAudioEntry) => {
    const file = new File([entry.audioBlob], entry.name, { type: entry.audioBlob.type });
    setReferenceAudioState(file);
    setReferenceText(entry.transcript);
    const nextUrl = URL.createObjectURL(entry.audioBlob);
    setReferenceAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  // Generations
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGenerations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/generations`);
      if (!response.ok) return;
      const data = (await response.json()) as { generations: Generation[] };
      setGenerations(Array.isArray(data.generations) ? data.generations : []);
    } catch {
      // ignore
    }
  }, []);

  // Load generations on mount
  useEffect(() => {
    refreshGenerations();
  }, [refreshGenerations]);

  const deleteGeneration = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/generations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete");
      setGenerations(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }, []);

  // Synthesis
  const synthesizeAudio = useCallback(async (text: string, seed: number): Promise<Generation> => {
    if (!referenceAudio) throw new Error("No reference audio");

    const formData = new FormData();
    formData.append("text", text);
    formData.append("speaker_audio", referenceAudio);
    formData.append("speaker_text", referenceText);
    formData.append("seed", seed.toString());

    const s = normalizeSettings(settings);
    formData.append("preset", s.preset);
    formData.append("sample_method", s.sample_method);
    formData.append("top_k", String(s.top_k));
    formData.append("top_p", String(s.top_p));
    formData.append("temperature", String(s.temperature));
    formData.append("min_token_text_ratio", String(s.min_token_text_ratio));
    formData.append("max_token_text_ratio", String(s.max_token_text_ratio));
    formData.append("use_cache", String(s.use_cache));
    formData.append("use_phoneme", String(s.use_phoneme));

    const response = await fetch(`${API_BASE}/api/synthesize`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }

    const data = (await response.json()) as { generation?: Generation };
    if (!data.generation) throw new Error("Invalid server response");
    return data.generation;
  }, [referenceAudio, referenceText, settings]);

  const synthesize = useCallback(async (text: string, seed: number): Promise<Generation> => {
    setIsLoading(true);
    setError(null);
    try {
      const generation = await synthesizeAudio(text, seed);
      setGenerations(prev => [generation, ...prev]);
      return generation;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Synthesis failed";
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [synthesizeAudio]);

  // Queue
  const {
    queue,
    isProcessing: isQueueProcessing,
    currentItem,
    addToQueue,
    removeFromQueue,
    clearCompleted,
    clearAll,
    processQueue: processQueueInternal,
    retryFailed,
  } = useQueue();

  const processQueue = useCallback(async () => {
    await processQueueInternal(async item => {
      const refAudio = item.referenceAudioFile ?? referenceAudio;
      if (!refAudio) throw new Error("Missing reference audio");

      const formData = new FormData();
      formData.append("text", item.text);
      formData.append("speaker_audio", refAudio);
      formData.append("speaker_text", item.referenceTranscript);
      formData.append("seed", item.seed.toString());

      const s = normalizeSettings(item.settings);
      formData.append("preset", s.preset);
      formData.append("sample_method", s.sample_method);
      formData.append("top_k", String(s.top_k));
      formData.append("top_p", String(s.top_p));
      formData.append("temperature", String(s.temperature));
      formData.append("min_token_text_ratio", String(s.min_token_text_ratio));
      formData.append("max_token_text_ratio", String(s.max_token_text_ratio));
      formData.append("use_cache", String(s.use_cache));
      formData.append("use_phoneme", String(s.use_phoneme));

      const response = await fetch(`${API_BASE}/api/synthesize`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const data = (await response.json()) as { generation?: Generation };
      if (!data.generation) throw new Error("Invalid server response");

      setGenerations(prev => [data.generation!, ...prev]);
      return { id: data.generation.id };
    });
  }, [processQueueInternal, referenceAudio]);

  // Audio converter
  const {
    convertToMP3,
    convertToFLAC,
    convertToOGG,
    loaded: ffmpegLoaded,
    loading: ffmpegLoading,
  } = useAudioConverter();

  // Now playing (mini player)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = useCallback((id: string, type: "output" | "reference", audioUrl: string, title: string, duration?: number) => {
    setNowPlaying({ id, type, audioUrl, title, duration });
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
  }, []);

  const pauseAudio = useCallback(() => {
    setIsPlaying(false);
    audioRef.current?.pause();
  }, []);

  const resumeAudio = useCallback(() => {
    setIsPlaying(true);
    audioRef.current?.play().catch(() => setIsPlaying(false));
  }, []);

  const stopAudio = useCallback(() => {
    setNowPlaying(null);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, []);

  // Export
  const [exportingId, setExportingId] = useState<string | null>(null);

  const exportGeneration = useCallback(async (gen: Generation) => {
    if (exportingId) {
      setError("Please wait for current export to finish");
      return;
    }
    setExportingId(gen.id);
    setError(null);

    try {
      const response = await fetch(gen.audio_url);
      if (!response.ok) throw new Error(`Failed to fetch audio (${response.status})`);
      const audioBlob = await response.blob();

      const extFromMime = (mime: string): string => {
        const lower = mime.toLowerCase();
        if (lower.includes("wav")) return "wav";
        if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
        if (lower.includes("flac")) return "flac";
        if (lower.includes("ogg")) return "ogg";
        return "audio";
      };

      const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const baseName = (filename: string) => {
        const lastDot = filename.lastIndexOf(".");
        return lastDot > 0 ? filename.slice(0, lastDot) : filename;
      };

      const fallbackName = `generation-${gen.id}.${extFromMime(gen.audio_mime)}`;
      const audioFilename = sanitize((gen.output_filename || fallbackName).trim());
      const base = baseName(audioFilename) || sanitize(`generation-${gen.id}`);

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(audioFilename, audioBlob);

      const metadata = {
        id: gen.id,
        created_at: gen.created_at,
        created_at_iso: new Date(gen.created_at).toISOString(),
        input_text: gen.input_text,
        reference_text: gen.reference_text,
        seed: gen.seed,
        audio: { mime: gen.audio_mime, filename: audioFilename },
        settings: gen.settings ?? {},
      };
      zip.file(`${base}.json`, JSON.stringify(metadata, null, 2));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = zipUrl;
      link.download = `${base}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setExportingId(null);
    }
  }, [exportingId]);

  // Waveform preference
  const [waveformEnabled, setWaveformEnabledState] = useState(() => {
    try {
      return localStorage.getItem("glmtts_waveform") !== "false";
    } catch {
      return true;
    }
  });

  const setWaveformEnabled = useCallback((enabled: boolean) => {
    setWaveformEnabledState(enabled);
    try {
      localStorage.setItem("glmtts_waveform", String(enabled));
    } catch {
      // ignore
    }
  }, []);

  // Format conversion
  const [selectedFormat, setSelectedFormat] = useState<"wav" | "mp3" | "flac" | "ogg">("wav");
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const convertAndDownload = useCallback(async (gen: Generation, format: "mp3" | "flac" | "ogg") => {
    if (convertingId) return;
    setConvertingId(gen.id);
    setError(null);

    try {
      let blob: Blob;
      if (format === "mp3") {
        blob = await convertToMP3(gen.audio_url);
      } else if (format === "flac") {
        blob = await convertToFLAC(gen.audio_url);
      } else {
        blob = await convertToOGG(gen.audio_url);
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const baseName = gen.output_filename?.replace(/\.[^.]*$/, "") || `generation-${gen.id}`;
      link.download = `${baseName}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Conversion failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setConvertingId(null);
    }
  }, [convertingId, convertToMP3, convertToFLAC, convertToOGG]);

  // Server health check
  const checkServerHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (response.ok) {
        const data = await response.json();
        setServerStatus(data);
        setError(null);
      } else {
        setServerStatus(null);
        setError("Server returned an error");
      }
    } catch {
      setServerStatus(null);
      setError("Cannot connect to server. Make sure it's running on port 8049.");
    }
    setStatusChecked(true);
  }, []);

  // Clear cache
  const clearCache = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clear_cache`);
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        checkServerHealth();
      }
    } catch {
      setError("Failed to clear cache");
    }
  }, [checkServerHealth]);

  const value: AppContextType = {
    apiBase: API_BASE,
    serverStatus,
    statusChecked,
    checkServerHealth,
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    referenceAudio,
    referenceAudioUrl,
    referenceText,
    setReferenceAudio,
    setReferenceText,
    loadReferenceFromLibrary,
    referenceLibrary,
    refreshReferenceLibrary,
    saveToLibrary,
    deleteFromLibrary,
    updateLibraryEntry,
    dbReady,
    generations,
    refreshGenerations,
    deleteGeneration,
    synthesize,
    isLoading,
    queue,
    isQueueProcessing,
    currentItem,
    addToQueue,
    removeFromQueue,
    clearCompleted,
    clearAll,
    processQueue,
    retryFailed,
    ffmpegLoaded,
    ffmpegLoading,
    convertToMP3,
    convertToFLAC,
    convertToOGG,
    nowPlaying,
    isPlaying,
    playAudio,
    pauseAudio,
    resumeAudio,
    stopAudio,
    audioRef,
    error,
    setError,
    exportingId,
    exportGeneration,
    waveformEnabled,
    setWaveformEnabled,
    selectedFormat,
    setSelectedFormat,
    convertingId,
    convertAndDownload,
    clearCache,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {/* Hidden audio element for mini player */}
      <audio
        ref={audioRef}
        onEnded={stopAudio}
        onError={() => {
          setError("Audio playback failed");
          stopAudio();
        }}
        style={{ display: "none" }}
      />
    </AppContext.Provider>
  );
}
