import { useEffect, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import "./index.css";
import { useReferenceAudioDB, getAudioDuration } from "./hooks/useIndexedDB";
import { StorageManager } from "./components/StorageManager";
import type { ReferenceAudioEntry } from "./types";

const API_BASE = "";

interface ServerHealth {
  status: string;
  device: string;
  fp16: boolean;
  speaker_cache_size: number;
}

type SampleMethod = "ras" | "topk";

type GenerationSettings = {
  preset:
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
  sample_method: SampleMethod;
  top_k: number;
  top_p: number;
  temperature: number;
  min_token_text_ratio: number;
  max_token_text_ratio: number;
  use_cache: boolean;
  use_phoneme: boolean;
};

const SETTINGS_STORAGE_KEY = "glmtts_settings_v1";

const PRESET_BALANCED: GenerationSettings = {
  preset: "balanced",
  // Default matches current server-side defaults.
  sample_method: "ras",
  top_k: 25,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

const PRESET_EXPRESSIVE: GenerationSettings = {
  preset: "expressive",
  sample_method: "ras",
  // Slightly higher diversity; may reduce stability.
  top_k: 35,
  top_p: 0.85,
  temperature: 1.05,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

const PRESET_STABLE: GenerationSettings = {
  preset: "stable",
  // More conservative sampling.
  sample_method: "topk",
  top_k: 15,
  top_p: 0.8,
  temperature: 1.0,
  min_token_text_ratio: 2,
  max_token_text_ratio: 20,
  use_cache: true,
  use_phoneme: false,
};

const PRESET_ULTRA_STABLE: GenerationSettings = {
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

const PRESET_CREATIVE: GenerationSettings = {
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

const PRESET_FAST: GenerationSettings = {
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

const PRESET_LONGFORM: GenerationSettings = {
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

const PRESET_PRONUNCIATION: GenerationSettings = {
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

const PRESET_LOW_REPETITION: GenerationSettings = {
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

const PRESET_SENSUAL: GenerationSettings = {
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

const PRESET_ASMR: GenerationSettings = {
  preset: "asmr",
  sample_method: "ras",
  top_k: 45,
  top_p: 0.92,
  temperature: 1.25,
  min_token_text_ratio: 2.8,
  max_token_text_ratio: 28,
  use_cache: true,
  use_phoneme: true,  // Enable for precise phoneme control
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Estimates generation time based on text length and settings.
 *
 * Empirical measurements:
 * - ~12.5 characters per second of audio
 * - ~80 LLM tokens per second generation speed
 * - ~0.5 seconds per Flow denoising step (10 steps = 5s)
 */
function estimateGenerationTime(text: string, settings: GenerationSettings): number {
  const charCount = text.length;
  if (charCount === 0) return 0;

  // Estimate LLM processing time
  const avgTokenTextRatio = (settings.min_token_text_ratio + settings.max_token_text_ratio) / 2;
  const estimatedTokens = charCount * avgTokenTextRatio;
  const tokensPerSecond = 80; // GPU-dependent, use conservative estimate
  const llmSeconds = estimatedTokens / tokensPerSecond;

  // Flow matching time (relatively constant)
  const flowSeconds = 5; // 10 steps * 0.5s/step

  // Total time (LLM + Flow + overhead)
  return Math.ceil(llmSeconds + flowSeconds + 2);
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function normalizeSettings(input: GenerationSettings): GenerationSettings {
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

function extFromMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("flac")) return "flac";
  if (lower.includes("ogg")) return "ogg";
  return "audio";
}

function baseName(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "";
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return trimmed;
  return trimmed.slice(0, lastDot);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAudioFile(file: File): boolean {
  return !file.type || file.type.startsWith("audio/");
}

type Generation = {
  id: string;
  input_text: string;
  reference_text: string | null;
  seed: number | null;
  created_at: number;
  audio_mime: string;
  output_filename: string;
  audio_url: string;
  settings?: Partial<GenerationSettings>;
};

export function App() {
  const [referenceAudio, setReferenceAudio] = useState<File | null>(null);
  const [referenceAudioUrl, setReferenceAudioUrl] = useState<string | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [inputText, setInputText] = useState("");
  const [seed, setSeed] = useState(42);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerHealth | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GenerationSettings>(() => {
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
  
  const audioInputRef = useRef<HTMLInputElement>(null);
  const outputPanelRef = useRef<HTMLDivElement>(null);
  const prevGenerationsLengthRef = useRef(generations.length);

  // IndexedDB for reference audio persistence
  const {
    saveAudio,
    listAudio,
    deleteAudio: deleteStoredAudio,
    ready: dbReady,
  } = useReferenceAudioDB();
  const [savedReferenceAudios, setSavedReferenceAudios] = useState<ReferenceAudioEntry[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/generations`);
        if (!response.ok) return;
        const data = (await response.json()) as { generations: Generation[] };
        setGenerations(Array.isArray(data.generations) ? data.generations : []);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Auto-scroll to output panel when a new generation is added
  useEffect(() => {
    if (generations.length > prevGenerationsLengthRef.current && generations.length > 0) {
      setTimeout(() => {
        outputPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100); // Small delay to ensure render complete
    }
    prevGenerationsLengthRef.current = generations.length;
  }, [generations.length]);

  // Load saved reference audios from IndexedDB
  const loadSavedReferenceAudios = useCallback(async () => {
    if (!dbReady) return;
    try {
      const audios = await listAudio();
      setSavedReferenceAudios(audios);
    } catch (err) {
      console.error("Failed to load saved reference audios:", err);
    }
  }, [dbReady, listAudio]);

  useEffect(() => {
    loadSavedReferenceAudios();
  }, [loadSavedReferenceAudios]);

  // Load generations from server
  const loadGenerations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/generations`);
      if (!response.ok) return;
      const data = (await response.json()) as { generations: Generation[] };
      setGenerations(Array.isArray(data.generations) ? data.generations : []);
    } catch {
      // ignore
    }
  }, []);

  // Save current reference audio to library
  const handleSaveToLibrary = async () => {
    if (!referenceAudio || !dbReady) return;

    const name = prompt("Name for this reference audio:");
    if (!name?.trim()) return;

    setSavingToLibrary(true);
    try {
      const duration = await getAudioDuration(referenceAudio).catch(() => undefined);

      await saveAudio({
        id: crypto.randomUUID(),
        name: name.trim(),
        audioBlob: referenceAudio,
        transcript: referenceText,
        createdAt: Date.now(),
        duration,
      });

      await loadSavedReferenceAudios();
      alert("Reference audio saved to library!");
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSavingToLibrary(false);
    }
  };

  // Load reference audio from library
  const handleLoadFromLibrary = (entry: ReferenceAudioEntry) => {
    const file = new File([entry.audioBlob], entry.name, { type: entry.audioBlob.type });
    setReferenceAudio(file);
    setReferenceText(entry.transcript);

    const nextUrl = URL.createObjectURL(entry.audioBlob);
    setReferenceAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });

    setShowLibrary(false);
    setError(null);
  };

  // Delete reference audio from library
  const handleDeleteFromLibrary = async (id: string) => {
    if (!confirm("Delete this reference audio from library?")) return;
    try {
      await deleteStoredAudio(id);
      await loadSavedReferenceAudios();
    } catch (err) {
      setError(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const checkServerHealth = async () => {
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
    } catch (e) {
      setServerStatus(null);
      setError("Cannot connect to server. Make sure it's running on port 8049.");
    }
    setStatusChecked(true);
  };

  const setReferenceAudioFile = useCallback((file: File) => {
    if (!isAudioFile(file)) {
      setError("Please upload a valid audio file");
      return;
    }

    setReferenceAudio(file);
    const nextUrl = URL.createObjectURL(file);
    setReferenceAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
    setError(null);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReferenceAudioFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setReferenceAudioFile(file);
  };

  useEffect(() => {
    return () => {
      if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
    };
  }, [referenceAudioUrl]);

  const handleSynthesize = async () => {
    if (!referenceAudio) {
      setError("Please upload a reference audio file");
      return;
    }
    if (!inputText.trim()) {
      setError("Please enter text to synthesize");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("text", inputText);
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
      setGenerations(prev => [data.generation!, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synthesis failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/clear_cache`);
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        checkServerHealth();
      }
    } catch (e) {
      setError("Failed to clear cache");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this generation?")) return;

    try {
      const response = await fetch(`${API_BASE}/api/generations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      // Remove from state
      setGenerations(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const handleExport = async (gen: Generation) => {
    if (exportingId) return;
    setExportingId(gen.id);
    setError(null);

    try {
      const response = await fetch(gen.audio_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio (${response.status})`);
      }
      const audioBlob = await response.blob();

      const fallbackName = `generation-${gen.id}.${extFromMime(gen.audio_mime)}`;
      const audioFilename = sanitizeFilename((gen.output_filename || fallbackName).trim());
      const base = baseName(audioFilename) || sanitizeFilename(`generation-${gen.id}`);

      const zip = new JSZip();
      zip.file(audioFilename, audioBlob);

      const metadata = {
        id: gen.id,
        created_at: gen.created_at,
        created_at_iso: new Date(gen.created_at).toISOString(),
        input_text: gen.input_text,
        reference_text: gen.reference_text,
        seed: gen.seed,
        audio: {
          mime: gen.audio_mime,
          filename: audioFilename,
        },
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
      URL.revokeObjectURL(zipUrl);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>GLM-TTS Studio</h1>
        <p className="subtitle">High-Quality Text-to-Speech with Zero-Shot Voice Cloning</p>
      </header>

      <div className="status-bar">
        <div className="status-actions">
          <button onClick={checkServerHealth} className="status-btn">
            Check Server
          </button>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="status-btn secondary"
            type="button"
          >
            Settings
          </button>
        </div>
        {statusChecked && (
          <span className={`status-indicator ${serverStatus?.status === "healthy" ? "healthy" : "error"}`}>
            {serverStatus?.status === "healthy" 
              ? `Connected | ${serverStatus.device} | FP16: ${serverStatus.fp16} | Cache: ${serverStatus.speaker_cache_size}`
              : "Server not available"}
          </span>
        )}
      </div>

      {settingsOpen && (
        <div className="settings-panel">
          <h2>Settings</h2>

          <div className="form-group">
            <label>Preset</label>
            <select
              value={settings.preset}
              onChange={e => {
                const preset = e.target.value as GenerationSettings["preset"];
                const next =
                  preset === "expressive"
                    ? PRESET_EXPRESSIVE
                    : preset === "stable"
                      ? PRESET_STABLE
                      : preset === "ultra_stable"
                        ? PRESET_ULTRA_STABLE
                        : preset === "creative"
                          ? PRESET_CREATIVE
                          : preset === "fast"
                            ? PRESET_FAST
                            : preset === "longform"
                              ? PRESET_LONGFORM
                              : preset === "pronunciation"
                                ? PRESET_PRONUNCIATION
                                : preset === "low_repetition"
                                  ? PRESET_LOW_REPETITION
                                  : preset === "sensual"
                                    ? PRESET_SENSUAL
                                    : preset === "asmr"
                                      ? PRESET_ASMR
                                      : preset === "custom"
                                        ? settings
                                        : PRESET_BALANCED;
                setSettings(normalizeSettings(next));
              }}
            >
              <option value="balanced">Balanced (default)</option>
              <option value="expressive">Expressive (controlled)</option>
              <option value="sensual">Sensual</option>
              <option value="asmr">ASMR / Intimate</option>
              <option value="stable">Stable</option>
              <option value="ultra_stable">Ultra stable</option>
              <option value="longform">Long-form continuity</option>
              <option value="fast">Fast / short output</option>
              <option value="creative">High variation</option>
              <option value="low_repetition">Low repetition</option>
              <option value="pronunciation">Pronunciation control (phoneme-in)</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label>Sampling Strategy</label>
            <select
              value={settings.sample_method}
              onChange={e =>
                setSettings(prev =>
                  normalizeSettings({
                    ...prev,
                    preset: "custom",
                    sample_method: e.target.value as SampleMethod,
                  }),
                )
              }
            >
              <option value="ras">RAS (recommended)</option>
              <option value="topk">Top-k</option>
            </select>
          </div>

          <div className="form-group">
            <label>Top-k</label>
            <input
              type="number"
              value={settings.top_k}
              min={1}
              max={200}
              onChange={e =>
                setSettings(prev =>
                  normalizeSettings({ ...prev, preset: "custom", top_k: Number(e.target.value) }),
                )
              }
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Top-p (RAS)</label>
              <input
                type="number"
                step={0.01}
                value={settings.top_p}
                min={0.01}
                max={1}
                disabled={settings.sample_method !== "ras"}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({ ...prev, preset: "custom", top_p: Number(e.target.value) }),
                  )
                }
              />
            </div>
            <div className="form-group">
              <label>Temperature (RAS)</label>
              <input
                type="number"
                step={0.01}
                value={settings.temperature}
                min={0.1}
                max={2}
                disabled={settings.sample_method !== "ras"}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({
                      ...prev,
                      preset: "custom",
                      temperature: Number(e.target.value),
                    }),
                  )
                }
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Min length ratio</label>
              <input
                type="number"
                step={0.5}
                value={settings.min_token_text_ratio}
                min={0.5}
                max={50}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({
                      ...prev,
                      preset: "custom",
                      min_token_text_ratio: Number(e.target.value),
                    }),
                  )
                }
              />
            </div>
            <div className="form-group">
              <label>Max length ratio</label>
              <input
                type="number"
                step={0.5}
                value={settings.max_token_text_ratio}
                min={0.5}
                max={50}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({
                      ...prev,
                      preset: "custom",
                      max_token_text_ratio: Number(e.target.value),
                    }),
                  )
                }
              />
            </div>
          </div>

          <div className="form-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.use_cache}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({ ...prev, preset: "custom", use_cache: e.target.checked }),
                  )
                }
              />
              Use cache (better continuity for long text)
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.use_phoneme}
                onChange={e =>
                  setSettings(prev =>
                    normalizeSettings({
                      ...prev,
                      preset: "custom",
                      use_phoneme: e.target.checked,
                    }),
                  )
                }
              />
              Enable phoneme-in (pronunciation control)
            </label>
          </div>

          <hr className="settings-divider" />

          <StorageManager onCleanup={loadGenerations} apiBase={API_BASE} />
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="main-content">
        <div className="panel">
          <div className="panel-header">
            <h2>Reference Voice</h2>
            {dbReady && savedReferenceAudios.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLibrary(v => !v)}
                className="btn-library"
              >
                {showLibrary ? "Hide Library" : `Library (${savedReferenceAudios.length})`}
              </button>
            )}
          </div>

          {showLibrary && savedReferenceAudios.length > 0 && (
            <div className="reference-library">
              <div className="library-header">
                <span>Saved Reference Audio</span>
              </div>
              <div className="library-items">
                {savedReferenceAudios.map(entry => (
                  <div key={entry.id} className="library-item">
                    <div className="library-item-info">
                      <span className="library-item-name">{entry.name}</span>
                      {entry.duration && (
                        <span className="library-item-duration">
                          {Math.round(entry.duration)}s
                        </span>
                      )}
                      {entry.transcript && (
                        <span className="library-item-transcript" title={entry.transcript}>
                          {entry.transcript.slice(0, 50)}{entry.transcript.length > 50 ? "..." : ""}
                        </span>
                      )}
                    </div>
                    <div className="library-item-actions">
                      <button
                        type="button"
                        onClick={() => handleLoadFromLibrary(entry)}
                        className="btn-load"
                        title="Load this reference"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFromLibrary(entry.id)}
                        className="btn-delete-small"
                        title="Delete from library"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Upload Reference Audio</label>
            <div
              className={`file-input-wrapper${isDragActive ? " drag-active" : ""}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                id="audio-upload"
              />
              <label htmlFor="audio-upload" className="file-label">
                {referenceAudio
                  ? referenceAudio.name
                  : isDragActive
                    ? "Drop audio file to upload"
                    : "Drag & drop audio here, or click to browse..."}
              </label>
            </div>
            {referenceAudioUrl && (
              <>
                <audio
                  controls
                  className="audio-preview"
                  src={referenceAudioUrl}
                  onError={() => setError("Reference audio failed to load/play. Try a different file/format.")}
                />
                {dbReady && (
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    disabled={savingToLibrary}
                    className="btn-save-library"
                  >
                    {savingToLibrary ? "Saving..." : "Save to Library"}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label>Reference Text (what's spoken in the audio)</label>
            <textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder="Enter the exact text from the reference audio..."
              rows={3}
            />
          </div>
        </div>

        <div className="panel">
          <h2>Text to Synthesize</h2>
          
          <div className="form-group">
            <label>Input Text</label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={5}
            />
            <div className="text-stats">
              <span>{inputText.length} characters</span>
              <span className="text-stats-separator">•</span>
              <span>~{formatDuration(estimateGenerationTime(inputText, settings))} estimated</span>
            </div>
          </div>

          <div className="form-group">
            <label>Seed</label>
            <div className="seed-input-group">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                min={0}
                max={999999}
              />
              <button
                type="button"
                onClick={() => setSeed(Math.floor(Math.random() * 1000000))}
                className="btn-icon"
                title="Generate random seed"
              >
                🎲
              </button>
            </div>
          </div>

          <button 
            onClick={handleSynthesize} 
            disabled={isLoading || !referenceAudio || !inputText.trim()}
            className="generate-btn"
          >
            {isLoading ? "Generating..." : "Generate Speech"}
          </button>
        </div>

        <div className="panel output-panel" ref={outputPanelRef}>
          <h2>Output</h2>

          {generations.length > 0 ? (
            <div className="output-audio">
              {generations.map(gen => (
                <div key={gen.id} className="output-item">
                  <div className="output-header">
                    <div className="output-meta">
                      <div className="output-time">
                        {new Date(gen.created_at).toLocaleString()}
                      </div>
                      <div className="output-text">{gen.input_text}</div>
                      {gen.settings && (
                        <div className="output-time">
                          Preset: {String(gen.settings.preset ?? "custom")} | {String(gen.settings.sample_method ?? "-")} | k={String(gen.settings.top_k ?? "-")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(gen.id)}
                      className="btn-delete"
                      title="Delete generation"
                    >
                      🗑️
                    </button>
                  </div>

                  <audio
                    controls
                    className="audio-player"
                    src={gen.audio_url}
                    onError={() => setError("Audio failed to load/play. Check server logs and audio format.")}
                  />
                  <div className="output-actions">
                    <a
                      href={gen.audio_url}
                      download={gen.output_filename}
                      className="download-btn"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => handleExport(gen)}
                      className="export-btn"
                      disabled={exportingId !== null}
                    >
                      {exportingId === gen.id ? "Exporting..." : "Export + Settings"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="placeholder">Generated audio will appear here</div>
          )}
        </div>
      </div>

      <footer className="footer">
        <button onClick={handleClearCache} className="secondary-btn">
          Clear Speaker Cache
        </button>
        <p className="tips">
          <strong>Tips:</strong> Use clear, high-quality reference audio (3-10 seconds). 
          Matching reference text improves voice similarity.
        </p>
      </footer>
    </div>
  );
}

export default App;
