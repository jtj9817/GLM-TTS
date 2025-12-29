import { useState, useEffect } from "react";
import type { GenerationSettings } from "../types";

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  settings: GenerationSettings;
  created_at: number;
}

interface Props {
  apiBase: string;
  onLoad: (settings: GenerationSettings) => void;
  currentSettings: GenerationSettings;
}

export function SavedConfigsLibrary({ apiBase, onLoad, currentSettings }: Props) {
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Save modal form state
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/configs`);
      if (!response.ok) {
        if (response.status === 404) {
          // Endpoint not implemented yet
          setConfigs([]);
          return;
        }
        throw new Error(`Failed to load configs: ${response.status}`);
      }
      const { configs: data } = (await response.json()) as { configs: SavedConfig[] };
      setConfigs(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load saved configs";
      setError(message);
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
        if (response.status === 404) {
          throw new Error("Saved configs feature not yet available on server");
        }
        throw new Error(`Failed to save config: ${response.status}`);
      }

      const config = (await response.json()) as SavedConfig;
      setConfigs(prev => [config, ...prev]);
      setShowSaveModal(false);
      setSaveName("");
      setSaveDescription("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save config";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete saved configuration "${name}"?`)) return;

    try {
      const response = await fetch(`${apiBase}/api/configs/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete config";
      setError(message);
    }
  };

  const handleLoad = (config: SavedConfig) => {
    onLoad(config.settings);
  };

  const getPresetLabel = (preset: string) => {
    const labels: Record<string, string> = {
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
    return labels[preset] || preset;
  };

  return (
    <div className="saved-configs-library">
      <div className="library-header">
        <h3>Saved Configurations</h3>
        <button
          onClick={() => setShowSaveModal(true)}
          className="btn-primary"
          type="button"
        >
          💾 Save Current
        </button>
      </div>

      {error && (
        <div className="error-message-inline">
          {error}
          <button
            onClick={() => setError(null)}
            className="error-dismiss"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <h3>Save Configuration</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label htmlFor="config-name">Name *</label>
                <input
                  id="config-name"
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g., Audiobook Narration"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="config-desc">Description</label>
                <textarea
                  id="config-desc"
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value)}
                  placeholder="Optional notes about this configuration..."
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder">Loading saved configurations...</div>
      ) : configs.length === 0 ? (
        <div className="configs-empty">
          <p>No saved configurations yet.</p>
          <p className="hint">
            Save your current settings to quickly reuse them later.
          </p>
        </div>
      ) : (
        <div className="configs-grid">
          {configs.map(config => (
            <div key={config.id} className="config-card">
              <div className="config-card-header">
                <h4>{config.name}</h4>
                <span className="config-date">
                  {new Date(config.created_at).toLocaleDateString()}
                </span>
              </div>

              {config.description && (
                <p className="config-description">{config.description}</p>
              )}

              <div className="config-settings">
                <div className="config-setting">
                  <span>Preset:</span>
                  <strong>{getPresetLabel(config.settings.preset)}</strong>
                </div>
                <div className="config-setting">
                  <span>Method:</span>
                  <strong>{config.settings.sample_method}</strong>
                </div>
                <div className="config-setting">
                  <span>Top K:</span>
                  <strong>{config.settings.top_k}</strong>
                </div>
                <div className="config-setting">
                  <span>Top P:</span>
                  <strong>{config.settings.top_p}</strong>
                </div>
                <div className="config-setting">
                  <span>Temp:</span>
                  <strong>{config.settings.temperature}</strong>
                </div>
                {config.settings.use_phoneme && (
                  <div className="config-setting config-highlight">
                    <span>🎯 Phoneme Mode</span>
                  </div>
                )}
              </div>

              <div className="config-actions">
                <button
                  onClick={() => handleLoad(config)}
                  className="btn-primary"
                  type="button"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(config.id, config.name)}
                  className="btn-delete-small"
                  type="button"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
