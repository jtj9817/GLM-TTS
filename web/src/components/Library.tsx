import { useState, useEffect, useMemo, useRef } from "react";
import { WaveformVisualizer } from "./WaveformVisualizer";
import type {
  Generation,
  GenerationSettings,
  ReferenceAudioEntry,
} from "../types";

type TabType = "outputs" | "references" | "presets";
type SortOption = "newest" | "oldest" | "name" | "duration" | "length";

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  settings: GenerationSettings;
  created_at: number;
}

interface LibraryProps {
  apiBase: string;
  // Outputs
  generations: Generation[];
  onDeleteGeneration: (id: string) => void;
  onExportGeneration: (gen: Generation) => void;
  exportingId: string | null;
  waveformEnabled: boolean;
  onToggleWaveform: (enabled: boolean) => void;
  // Audio conversion
  ffmpegLoaded: boolean;
  ffmpegLoading: boolean;
  selectedFormat: "wav" | "mp3" | "flac" | "ogg";
  onFormatChange: (format: "wav" | "mp3" | "flac" | "ogg") => void;
  onConvert: (gen: Generation, format: "mp3" | "flac" | "ogg") => void;
  convertingId: string | null;
  // Reference Audio
  referenceAudios: ReferenceAudioEntry[];
  onSelectReference: (entry: ReferenceAudioEntry) => void;
  onDeleteReference: (id: string) => void;
  onUpdateReference: (entry: ReferenceAudioEntry) => void;
  // Presets
  onLoadPreset: (settings: GenerationSettings) => void;
  currentSettings: GenerationSettings;
}

const PRESET_LABELS: Record<string, string> = {
  balanced: "Balanced",
  expressive: "Expressive",
  stable: "Stable",
  ultra_stable: "Ultra Stable",
  creative: "Creative",
  fast: "Fast",
  longform: "Long-form",
  pronunciation: "Pronunciation",
  low_repetition: "Low Repetition",
  sensual: "Sensual",
  asmr: "ASMR",
  custom: "Custom",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// Outputs Tab Component
// ============================================
function OutputsTab({
  generations,
  onDelete,
  onExport,
  exportingId,
  waveformEnabled,
  onToggleWaveform,
  ffmpegLoaded,
  ffmpegLoading,
  selectedFormat,
  onFormatChange,
  onConvert,
  convertingId,
}: {
  generations: Generation[];
  onDelete: (id: string) => void;
  onExport: (gen: Generation) => void;
  exportingId: string | null;
  waveformEnabled: boolean;
  onToggleWaveform: (enabled: boolean) => void;
  ffmpegLoaded: boolean;
  ffmpegLoading: boolean;
  selectedFormat: "wav" | "mp3" | "flac" | "ogg";
  onFormatChange: (format: "wav" | "mp3" | "flac" | "ogg") => void;
  onConvert: (gen: Generation, format: "mp3" | "flac" | "ogg") => void;
  convertingId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filtered = useMemo(() => {
    let items = [...generations];

    // Filter by search
    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(
        g =>
          g.input_text.toLowerCase().includes(query) ||
          (g.reference_text && g.reference_text.toLowerCase().includes(query))
      );
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.created_at - b.created_at;
        case "length":
          return b.input_text.length - a.input_text.length;
        case "newest":
        default:
          return b.created_at - a.created_at;
      }
    });

    return items;
  }, [generations, search, sortBy]);

  return (
    <div className="library-tab-content">
      <div className="library-toolbar">
        <div className="library-search">
          <input
            type="text"
            placeholder="Search by text..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="library-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="library-search-clear"
              type="button"
            >
              x
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          className="library-sort"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="length">Text Length</option>
        </select>
        <label className="library-toggle">
          <input
            type="checkbox"
            checked={waveformEnabled}
            onChange={e => onToggleWaveform(e.target.checked)}
          />
          Waveforms
        </label>
      </div>

      <div className="library-count">
        {filtered.length} of {generations.length} outputs
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          {search ? "No matching outputs found" : "No generated audio yet"}
        </div>
      ) : (
        <div className="library-grid outputs-grid">
          {filtered.map(gen => (
            <div key={gen.id} className="library-card output-card">
              <div className="card-header">
                <span className="card-date">{formatDate(gen.created_at)}</span>
                <button
                  onClick={() => {
                    if (confirm("Delete this generation?")) onDelete(gen.id);
                  }}
                  className="card-delete"
                  title="Delete"
                  type="button"
                >
                  x
                </button>
              </div>

              <div className="card-body">
                <p className="card-text" title={gen.input_text}>
                  {gen.input_text.slice(0, 120)}
                  {gen.input_text.length > 120 ? "..." : ""}
                </p>
                {gen.reference_text && (
                  <p className="card-subtext" title={gen.reference_text}>
                    Ref: "{gen.reference_text.slice(0, 60)}
                    {gen.reference_text.length > 60 ? "..." : ""}"
                  </p>
                )}
                {gen.settings && (
                  <div className="card-meta">
                    <span className="card-preset">
                      {PRESET_LABELS[gen.settings.preset || "custom"]}
                    </span>
                    {gen.seed !== null && (
                      <span className="card-seed">Seed: {gen.seed}</span>
                    )}
                  </div>
                )}
              </div>

              {waveformEnabled && (
                <div className="card-waveform">
                  <WaveformVisualizer audioUrl={gen.audio_url} height={50} />
                </div>
              )}

              <audio controls className="card-audio" src={gen.audio_url} />

              <div className="card-actions">
                <a
                  href={gen.audio_url}
                  download={gen.output_filename}
                  className="btn-download"
                >
                  WAV
                </a>
                <button
                  onClick={() => onExport(gen)}
                  className="btn-export"
                  disabled={exportingId === gen.id}
                  type="button"
                >
                  {exportingId === gen.id ? "..." : "ZIP"}
                </button>
                {ffmpegLoading && !ffmpegLoaded && (
                  <span className="converter-loading">Loading...</span>
                )}
                {ffmpegLoaded && (
                  <>
                    <select
                      value={selectedFormat}
                      onChange={e =>
                        onFormatChange(e.target.value as typeof selectedFormat)
                      }
                      className="format-select-small"
                    >
                      <option value="wav">WAV</option>
                      <option value="mp3">MP3</option>
                      <option value="flac">FLAC</option>
                      <option value="ogg">OGG</option>
                    </select>
                    {selectedFormat !== "wav" && (
                      <button
                        onClick={() => onConvert(gen, selectedFormat)}
                        className="btn-convert"
                        disabled={convertingId === gen.id}
                        type="button"
                      >
                        {convertingId === gen.id ? "..." : selectedFormat.toUpperCase()}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// References Tab Component
// ============================================
function ReferencesTab({
  references,
  onSelect,
  onDelete,
  onUpdate,
}: {
  references: ReferenceAudioEntry[];
  onSelect: (entry: ReferenceAudioEntry) => void;
  onDelete: (id: string) => void;
  onUpdate: (entry: ReferenceAudioEntry) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const audioUrlsRef = useRef<Map<string, string>>(new Map());

  // Create and manage object URLs for audio blobs
  const getAudioUrl = (entry: ReferenceAudioEntry): string => {
    if (!audioUrlsRef.current.has(entry.id)) {
      audioUrlsRef.current.set(entry.id, URL.createObjectURL(entry.audioBlob));
    }
    return audioUrlsRef.current.get(entry.id)!;
  };

  // Cleanup URLs when references change
  useEffect(() => {
    const currentIds = new Set(references.map(r => r.id));
    audioUrlsRef.current.forEach((url, id) => {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        audioUrlsRef.current.delete(id);
      }
    });
  }, [references]);

  // Cleanup all URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      audioUrlsRef.current.clear();
    };
  }, []);

  const filtered = useMemo(() => {
    let items = [...references];

    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(
        r =>
          r.name.toLowerCase().includes(query) ||
          r.transcript.toLowerCase().includes(query)
      );
    }

    items.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.createdAt - b.createdAt;
        case "name":
          return a.name.localeCompare(b.name);
        case "duration":
          return (b.duration || 0) - (a.duration || 0);
        case "newest":
        default:
          return b.createdAt - a.createdAt;
      }
    });

    return items;
  }, [references, search, sortBy]);

  const startEdit = (entry: ReferenceAudioEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
  };

  const saveEdit = (entry: ReferenceAudioEntry) => {
    if (editName.trim()) {
      onUpdate({ ...entry, name: editName.trim() });
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  return (
    <div className="library-tab-content">
      <div className="library-toolbar">
        <div className="library-search">
          <input
            type="text"
            placeholder="Search by name or transcript..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="library-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="library-search-clear"
              type="button"
            >
              x
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          className="library-sort"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name A-Z</option>
          <option value="duration">Duration</option>
        </select>
      </div>

      <div className="library-count">
        {filtered.length} of {references.length} reference audios
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          {search
            ? "No matching reference audio found"
            : "No saved reference audio yet. Upload audio and click 'Save to Library' to add."}
        </div>
      ) : (
        <div className="library-grid references-grid">
          {filtered.map(entry => (
            <div key={entry.id} className="library-card reference-card">
              <div className="card-header">
                {editingId === entry.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="card-name-input"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") saveEdit(entry);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <h3 className="card-name">{entry.name}</h3>
                )}
                <div className="card-header-meta">
                  {entry.duration && (
                    <span className="card-duration">
                      {formatDuration(entry.duration)}
                    </span>
                  )}
                </div>
              </div>

              <div className="card-body">
                {entry.transcript && (
                  <p className="card-transcript" title={entry.transcript}>
                    "{entry.transcript.slice(0, 100)}
                    {entry.transcript.length > 100 ? "..." : ""}"
                  </p>
                )}
                <span className="card-date-small">
                  {formatDate(entry.createdAt)}
                </span>
              </div>

              <audio
                controls
                className="card-audio"
                src={getAudioUrl(entry)}
              />

              <div className="card-actions">
                {editingId === entry.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(entry)}
                      className="btn-save"
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="btn-cancel"
                      type="button"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onSelect(entry)}
                      className="btn-use"
                      type="button"
                    >
                      Use This
                    </button>
                    <button
                      onClick={() => startEdit(entry)}
                      className="btn-edit"
                      title="Rename"
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${entry.name}"?`)) onDelete(entry.id);
                      }}
                      className="btn-delete-small"
                      title="Delete"
                      type="button"
                    >
                      x
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Presets Tab Component
// ============================================
function PresetsTab({
  apiBase,
  onLoad,
  currentSettings,
}: {
  apiBase: string;
  onLoad: (settings: GenerationSettings) => void;
  currentSettings: GenerationSettings;
}) {
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, [apiBase]);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/configs`);
      if (!response.ok) {
        if (response.status === 404) {
          setConfigs([]);
          return;
        }
        throw new Error(`Failed: ${response.status}`);
      }
      const { configs: data } = (await response.json()) as { configs: SavedConfig[] };
      setConfigs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          description: saveDescription.trim() || null,
          settings: currentSettings,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.status}`);
      }

      setShowSaveModal(false);
      setSaveName("");
      setSaveDescription("");
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return;

    try {
      const response = await fetch(`${apiBase}/api/configs/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const filtered = useMemo(() => {
    let items = [...configs];

    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          (c.description && c.description.toLowerCase().includes(query))
      );
    }

    items.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.created_at - b.created_at;
        case "name":
          return a.name.localeCompare(b.name);
        case "newest":
        default:
          return b.created_at - a.created_at;
      }
    });

    return items;
  }, [configs, search, sortBy]);

  return (
    <div className="library-tab-content">
      <div className="library-toolbar">
        <div className="library-search">
          <input
            type="text"
            placeholder="Search presets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="library-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="library-search-clear"
              type="button"
            >
              x
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          className="library-sort"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name A-Z</option>
        </select>
        <button
          onClick={() => setShowSaveModal(true)}
          className="btn-save-preset"
          type="button"
        >
          + Save Current
        </button>
      </div>

      {error && (
        <div className="library-error">
          {error}
          <button onClick={() => setError(null)} type="button">
            x
          </button>
        </div>
      )}

      <div className="library-count">
        {filtered.length} of {configs.length} saved presets
      </div>

      {loading ? (
        <div className="library-loading">Loading presets...</div>
      ) : filtered.length === 0 ? (
        <div className="library-empty">
          {search
            ? "No matching presets found"
            : "No saved presets yet. Click '+ Save Current' to save your current settings."}
        </div>
      ) : (
        <div className="library-grid presets-grid">
          {filtered.map(config => (
            <div key={config.id} className="library-card preset-card">
              <div className="card-header">
                <h3 className="card-name">{config.name}</h3>
                <span className="card-date-small">
                  {new Date(config.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="card-body">
                {config.description && (
                  <p className="card-description">{config.description}</p>
                )}
                <div className="preset-settings">
                  <span className="preset-tag">
                    {PRESET_LABELS[config.settings.preset || "custom"]}
                  </span>
                  <span className="preset-detail">
                    k={config.settings.top_k}
                  </span>
                  <span className="preset-detail">
                    p={config.settings.top_p}
                  </span>
                  <span className="preset-detail">
                    t={config.settings.temperature}
                  </span>
                  {config.settings.use_phoneme && (
                    <span className="preset-tag phoneme">Phoneme</span>
                  )}
                </div>
              </div>

              <div className="card-actions">
                <button
                  onClick={() => onLoad(config.settings)}
                  className="btn-use"
                  type="button"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(config.id, config.name)}
                  className="btn-delete-small"
                  title="Delete"
                  type="button"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save Current Settings</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="modal-close"
                type="button"
              >
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="My Preset"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value)}
                  placeholder="What is this preset for?"
                  rows={2}
                />
              </div>
              <div className="preset-preview">
                <span>Preset: {PRESET_LABELS[currentSettings.preset]}</span>
                <span>Top-k: {currentSettings.top_k}</span>
                <span>Top-p: {currentSettings.top_p}</span>
                <span>Temp: {currentSettings.temperature}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowSaveModal(false)}
                className="btn-cancel"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-save"
                disabled={saving || !saveName.trim()}
                type="button"
              >
                {saving ? "Saving..." : "Save Preset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Library Component
// ============================================
export function Library({
  apiBase,
  generations,
  onDeleteGeneration,
  onExportGeneration,
  exportingId,
  waveformEnabled,
  onToggleWaveform,
  ffmpegLoaded,
  ffmpegLoading,
  selectedFormat,
  onFormatChange,
  onConvert,
  convertingId,
  referenceAudios,
  onSelectReference,
  onDeleteReference,
  onUpdateReference,
  onLoadPreset,
  currentSettings,
}: LibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>("outputs");

  return (
    <div className="library-panel">
      <div className="library-header">
        <h2>Library</h2>
      </div>

      <div className="library-tabs">
        <button
          className={`library-tab ${activeTab === "outputs" ? "active" : ""}`}
          onClick={() => setActiveTab("outputs")}
          type="button"
        >
          Outputs
          {generations.length > 0 && (
            <span className="tab-count">{generations.length}</span>
          )}
        </button>
        <button
          className={`library-tab ${activeTab === "references" ? "active" : ""}`}
          onClick={() => setActiveTab("references")}
          type="button"
        >
          Reference Audio
          {referenceAudios.length > 0 && (
            <span className="tab-count">{referenceAudios.length}</span>
          )}
        </button>
        <button
          className={`library-tab ${activeTab === "presets" ? "active" : ""}`}
          onClick={() => setActiveTab("presets")}
          type="button"
        >
          Saved Presets
        </button>
      </div>

      {activeTab === "outputs" && (
        <OutputsTab
          generations={generations}
          onDelete={onDeleteGeneration}
          onExport={onExportGeneration}
          exportingId={exportingId}
          waveformEnabled={waveformEnabled}
          onToggleWaveform={onToggleWaveform}
          ffmpegLoaded={ffmpegLoaded}
          ffmpegLoading={ffmpegLoading}
          selectedFormat={selectedFormat}
          onFormatChange={onFormatChange}
          onConvert={onConvert}
          convertingId={convertingId}
        />
      )}

      {activeTab === "references" && (
        <ReferencesTab
          references={referenceAudios}
          onSelect={onSelectReference}
          onDelete={onDeleteReference}
          onUpdate={onUpdateReference}
        />
      )}

      {activeTab === "presets" && (
        <PresetsTab
          apiBase={apiBase}
          onLoad={onLoadPreset}
          currentSettings={currentSettings}
        />
      )}
    </div>
  );
}
