import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { MediaCard } from "./MediaCard";
import type { GenerationSettings } from "../../types";

type SortOption = "newest" | "oldest" | "name";

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  settings: GenerationSettings;
  created_at: number;
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

export function PresetsPanel() {
  const navigate = useNavigate();
  const { apiBase, setSettings, settings: currentSettings } = useApp();

  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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

  const handleLoad = (config: SavedConfig) => {
    setSettings(config.settings);
    navigate("/");
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
    <div className="library-panel-content">
      <div className="library-toolbar">
        <div className="library-search">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search presets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="library-search-input"
          />
          {search && (
            <button onClick={() => setSearch("")} className="search-clear" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="library-toolbar-actions">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="library-sort"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name A-Z</option>
          </select>

          <div className="view-toggle">
            <button
              onClick={() => setViewMode("grid")}
              className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
              title="Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`view-btn ${viewMode === "list" ? "active" : ""}`}
              title="List View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => setShowSaveModal(true)}
            className="btn-save-preset"
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Save Current
          </button>
        </div>
      </div>

      {error && (
        <div className="library-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="library-stats">
        <span className="stats-count">{filtered.length} of {configs.length} saved presets</span>
      </div>

      {loading ? (
        <div className="library-loading">
          <div className="loading-spinner" />
          <span>Loading presets...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="library-empty">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </div>
          <h3>{search ? "No matching presets" : "No saved presets"}</h3>
          <p>
            {search
              ? "Try a different search term"
              : "Click 'Save Current' to save your current settings as a preset"}
          </p>
          {!search && (
            <button onClick={() => setShowSaveModal(true)} className="btn-primary">
              Save Current Settings
            </button>
          )}
        </div>
      ) : (
        <div className={`library-grid library-grid--${viewMode}`}>
          {filtered.map(config => (
            <MediaCard
              key={config.id}
              type="preset"
              title={config.name}
              subtitle={config.description || undefined}
              date={config.created_at}
              tags={[
                { label: PRESET_LABELS[config.settings.preset || "custom"] || "Custom", variant: "primary" as const },
                ...(config.settings.use_phoneme ? [{ label: "Phoneme", variant: "accent" as const }] : []),
              ]}
              metadata={[
                { label: "k", value: String(config.settings.top_k) },
                { label: "p", value: String(config.settings.top_p) },
                { label: "t", value: String(config.settings.temperature) },
              ]}
              actions={[
                {
                  label: "Load",
                  onClick: () => handleLoad(config),
                  variant: "primary",
                },
                {
                  label: "Delete",
                  onClick: () => handleDelete(config.id, config.name),
                  variant: "danger",
                },
              ]}
            />
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
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
                <div className="preview-item">
                  <span className="preview-label">Preset:</span>
                  <span className="preview-value">{PRESET_LABELS[currentSettings.preset]}</span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Top-k:</span>
                  <span className="preview-value">{currentSettings.top_k}</span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Top-p:</span>
                  <span className="preview-value">{currentSettings.top_p}</span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Temp:</span>
                  <span className="preview-value">{currentSettings.temperature}</span>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowSaveModal(false)}
                className="btn-secondary"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-primary"
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
