import { useEffect, useRef, useState } from "react";
import "./index.css";

const API_BASE = "";

interface ServerHealth {
  status: string;
  device: string;
  fp16: boolean;
  speaker_cache_size: number;
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
        <button onClick={checkServerHealth} className="status-btn">
          Check Server
        </button>
        {statusChecked && (
          <span className={`status-indicator ${serverStatus?.status === "healthy" ? "healthy" : "error"}`}>
            {serverStatus?.status === "healthy" 
              ? `Connected | ${serverStatus.device} | FP16: ${serverStatus.fp16} | Cache: ${serverStatus.speaker_cache_size}`
              : "Server not available"}
          </span>
        )}
      </div>

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
