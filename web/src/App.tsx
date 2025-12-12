import { useEffect, useRef, useState } from "react";
import "./index.css";

const API_BASE = "";

interface ServerHealth {
  status: string;
  device: string;
  fp16: boolean;
  speaker_cache_size: number;
}

type SampleMethod = "ras" | "topk";

type GenerationSettings = {
  preset: "balanced" | "expressive" | "stable";
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceAudio(file);
      const nextUrl = URL.createObjectURL(file);
      setReferenceAudioUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setError(null);
    }
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
                      : PRESET_BALANCED;
                setSettings(normalizeSettings(next));
              }}
            >
              <option value="balanced">Balanced (default)</option>
              <option value="expressive">More expressive</option>
              <option value="stable">More stable</option>
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
                    preset: "balanced",
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
                  normalizeSettings({ ...prev, preset: "balanced", top_k: Number(e.target.value) }),
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
                    normalizeSettings({ ...prev, preset: "balanced", top_p: Number(e.target.value) }),
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
                      preset: "balanced",
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
                      preset: "balanced",
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
                      preset: "balanced",
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
                    normalizeSettings({ ...prev, preset: "balanced", use_cache: e.target.checked }),
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
                      preset: "balanced",
                      use_phoneme: e.target.checked,
                    }),
                  )
                }
              />
              Enable phoneme-in (pronunciation control)
            </label>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="main-content">
        <div className="panel">
          <h2>Reference Voice</h2>
          
          <div className="form-group">
            <label>Upload Reference Audio</label>
            <div className="file-input-wrapper">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                id="audio-upload"
              />
              <label htmlFor="audio-upload" className="file-label">
                {referenceAudio ? referenceAudio.name : "Choose audio file..."}
              </label>
            </div>
            {referenceAudioUrl && (
              <audio
                controls
                className="audio-preview"
                src={referenceAudioUrl}
                onError={() => setError("Reference audio failed to load/play. Try a different file/format.")}
              />
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
          </div>

          <div className="form-group">
            <label>Seed</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
              min={0}
              max={999999}
            />
          </div>

          <button 
            onClick={handleSynthesize} 
            disabled={isLoading || !referenceAudio || !inputText.trim()}
            className="generate-btn"
          >
            {isLoading ? "Generating..." : "Generate Speech"}
          </button>
        </div>

        <div className="panel output-panel">
          <h2>Output</h2>

          {generations.length > 0 ? (
            <div className="output-audio">
              {generations.map(gen => (
                <div key={gen.id} className="output-item">
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

                  <audio
                    controls
                    className="audio-player"
                    src={gen.audio_url}
                    onError={() => setError("Audio failed to load/play. Check server logs and audio format.")}
                  />
                  <a
                    href={gen.audio_url}
                    download={gen.output_filename}
                    className="download-btn"
                  >
                    Download
                  </a>
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
