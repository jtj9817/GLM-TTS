import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useApp, PRESET_DESCRIPTIONS, PRESET_VALUES, normalizeSettings, estimateGenerationTime, formatDuration } from "../../context/AppContext";
import { StorageManager } from "../StorageManager";
import { GenerationQueue } from "../GenerationQueue";
import { SavedConfigsLibrary } from "../SavedConfigsLibrary";
import { ReferenceAudioLibraryModal } from "../ReferenceAudioLibraryModal";
import type { GenerationSettings, SampleMethod } from "../../types";

function isAudioFile(file: File): boolean {
  return !file.type || file.type.startsWith("audio/");
}

export function SynthesisPage() {
  const navigate = useNavigate();
  const {
    apiBase,
    settings,
    setSettings,
    settingsOpen,
    referenceAudio,
    referenceAudioUrl,
    referenceText,
    setReferenceAudio,
    setReferenceText,
    loadReferenceFromLibrary,
    referenceLibrary,
    saveToLibrary,
    deleteFromLibrary,
    updateLibraryEntry,
    dbReady,
    generations,
    refreshGenerations,
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
    error,
    setError,
    clearCache,
  } = useApp();

  const [inputText, setInputText] = useState("");
  const [seed, setSeed] = useState(42);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);

  const setReferenceAudioFile = useCallback((file: File) => {
    if (!isAudioFile(file)) {
      setError("Please upload a valid audio file");
      return;
    }
    setReferenceAudio(file);
    setError(null);
  }, [setReferenceAudio, setError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setReferenceAudioFile(file);
  };

  const hasFiles = (e: React.DragEvent): boolean => {
    return Array.from(e.dataTransfer.types).includes("Files");
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
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
    if (!hasFiles(e)) return;
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setReferenceAudioFile(file);
  };

  const handleSynthesize = async () => {
    if (!referenceAudio) {
      setError("Please upload a reference audio file");
      return;
    }
    if (!inputText.trim()) {
      setError("Please enter text to synthesize");
      return;
    }

    try {
      await synthesize(inputText, seed);
      // Navigate to library to see the result
      navigate("/library/outputs");
    } catch {
      // Error already handled in context
    }
  };

  const handleAddToQueue = () => {
    if (!referenceAudio) {
      setError("Please upload a reference audio file");
      return;
    }
    if (!inputText.trim()) {
      setError("Please enter text to synthesize");
      return;
    }

    addToQueue({
      text: inputText,
      referenceAudioId: referenceAudio.name,
      referenceAudioFile: referenceAudio,
      referenceTranscript: referenceText,
      settings: normalizeSettings(settings),
      seed,
    });

    setInputText("");
    setError(null);
  };

  const handleSaveToLibrary = async () => {
    if (!referenceAudio || !dbReady) return;

    const name = prompt("Name for this reference audio:");
    if (!name?.trim()) return;

    setSavingToLibrary(true);
    try {
      await saveToLibrary(name.trim());
      alert("Reference audio saved to library!");
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSavingToLibrary(false);
    }
  };

  const handleLoadFromLibrary = (entry: Parameters<typeof loadReferenceFromLibrary>[0]) => {
    loadReferenceFromLibrary(entry);
    setShowLibraryModal(false);
    setError(null);
  };

  return (
    <div className="synthesis-page">
      {settingsOpen && (
        <div className="settings-panel">
          <h2>Settings</h2>

          <div className="form-group">
            <label>Preset</label>
            <select
              value={settings.preset}
              title={PRESET_DESCRIPTIONS[settings.preset]}
              onChange={e => {
                const preset = e.target.value as GenerationSettings["preset"];
                const next = preset === "custom" ? settings : PRESET_VALUES[preset];
                setSettings(normalizeSettings(next));
              }}
            >
              <option value="balanced" title={PRESET_DESCRIPTIONS.balanced}>
                Balanced (default)
              </option>
              <option value="expressive" title={PRESET_DESCRIPTIONS.expressive}>
                Expressive (controlled)
              </option>
              <option value="sensual" title={PRESET_DESCRIPTIONS.sensual}>
                Sensual
              </option>
              <option value="asmr" title={PRESET_DESCRIPTIONS.asmr}>
                ASMR / Intimate
              </option>
              <option value="stable" title={PRESET_DESCRIPTIONS.stable}>
                Stable
              </option>
              <option value="ultra_stable" title={PRESET_DESCRIPTIONS.ultra_stable}>
                Ultra stable
              </option>
              <option value="longform" title={PRESET_DESCRIPTIONS.longform}>
                Long-form continuity
              </option>
              <option value="fast" title={PRESET_DESCRIPTIONS.fast}>
                Fast / short output
              </option>
              <option value="creative" title={PRESET_DESCRIPTIONS.creative}>
                High variation
              </option>
              <option value="low_repetition" title={PRESET_DESCRIPTIONS.low_repetition}>
                Low repetition
              </option>
              <option value="pronunciation" title={PRESET_DESCRIPTIONS.pronunciation}>
                Pronunciation control (phoneme-in)
              </option>
              <option value="custom" title={PRESET_DESCRIPTIONS.custom}>
                Custom
              </option>
            </select>
            <div className="preset-hint" aria-live="polite">
              {PRESET_DESCRIPTIONS[settings.preset]}
            </div>
          </div>

          <div className="form-group">
            <label>Sampling Strategy</label>
            <select
              value={settings.sample_method}
              onChange={e =>
                setSettings(
                  normalizeSettings({
                    ...settings,
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
                setSettings(
                  normalizeSettings({ ...settings, preset: "custom", top_k: Number(e.target.value) }),
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
                  setSettings(
                    normalizeSettings({ ...settings, preset: "custom", top_p: Number(e.target.value) }),
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
                  setSettings(
                    normalizeSettings({
                      ...settings,
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
                  setSettings(
                    normalizeSettings({
                      ...settings,
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
                  setSettings(
                    normalizeSettings({
                      ...settings,
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
                  setSettings(
                    normalizeSettings({ ...settings, preset: "custom", use_cache: e.target.checked }),
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
                  setSettings(
                    normalizeSettings({
                      ...settings,
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

          <StorageManager onCleanup={refreshGenerations} apiBase={apiBase} />

          <hr className="settings-divider" />

          <SavedConfigsLibrary
            apiBase={apiBase}
            onLoad={setSettings}
            currentSettings={settings}
          />
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="main-content">
        <div className="panel">
          <div className="panel-header">
            <h2>Reference Voice</h2>
            <div className="panel-header-actions">
              {dbReady && referenceLibrary.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(true)}
                  className="btn-library"
                >
                  Library ({referenceLibrary.length})
                </button>
              )}
            </div>
          </div>

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
              <span className="text-stats-separator">|</span>
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
                onClick={() => setSeed(Math.floor(Math.random() * 999999))}
                className="btn-icon"
                title="Generate random seed"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                  <rect x="14" y="2" width="8" height="8" rx="1" />
                  <rect x="2" y="14" width="8" height="8" rx="1" />
                  <rect x="14" y="14" width="8" height="8" rx="1" />
                  <circle cx="6" cy="6" r="1" fill="currentColor" />
                  <circle cx="18" cy="6" r="1" fill="currentColor" />
                  <circle cx="6" cy="18" r="1" fill="currentColor" />
                  <circle cx="18" cy="18" r="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <div className="generation-actions">
            <button
              onClick={handleSynthesize}
              disabled={isLoading || !referenceAudio || !inputText.trim()}
              className="generate-btn"
            >
              {isLoading ? "Generating..." : "Generate Speech"}
            </button>
            <button
              onClick={handleAddToQueue}
              className="btn-secondary queue-add-btn"
              disabled={!referenceAudio || !inputText.trim()}
              type="button"
            >
              + Add to Queue
            </button>
          </div>
        </div>

        <GenerationQueue
          queue={queue}
          isProcessing={isQueueProcessing}
          currentItem={currentItem}
          apiBase={apiBase}
          onRemove={removeFromQueue}
          onProcess={processQueue}
          onClearCompleted={clearCompleted}
          onClearAll={clearAll}
          onRetryFailed={retryFailed}
        />

        {/* Quick stats at bottom */}
        <div className="synthesis-footer">
          <div className="quick-stats">
            <span className="stat">
              <strong>{generations.length}</strong> outputs
            </span>
            <span className="stat">
              <strong>{referenceLibrary.length}</strong> voices saved
            </span>
          </div>
          <button onClick={clearCache} className="secondary-btn">
            Clear Speaker Cache
          </button>
        </div>
      </div>

      <ReferenceAudioLibraryModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        onSelect={handleLoadFromLibrary}
        library={referenceLibrary}
        onDelete={deleteFromLibrary}
        onSave={updateLibraryEntry}
      />
    </div>
  );
}
