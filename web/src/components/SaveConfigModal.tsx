import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { GenerationSettings } from "../types";

interface SaveConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  referenceText: string;
  inputText: string;
  referenceVoiceId?: string;
  referenceVoiceName?: string;
  settings: GenerationSettings;
}

export function SaveConfigModal({
  isOpen,
  onClose,
  referenceText,
  inputText,
  referenceVoiceId,
  referenceVoiceName,
  settings,
}: SaveConfigModalProps) {
  const { saveGenerationConfig } = useApp();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includeVoice, setIncludeVoice] = useState(!!referenceVoiceId);
  const [includeSettings, setIncludeSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveGenerationConfig({
        name: name.trim(),
        description: description.trim() || undefined,
        referenceText,
        inputText,
        referenceVoiceId: includeVoice ? referenceVoiceId : undefined,
        referenceVoiceName: includeVoice ? referenceVoiceName : undefined,
        settings: includeSettings ? settings : undefined,
        includeSettings,
      });

      // Reset form and close
      setName("");
      setDescription("");
      setIncludeVoice(!!referenceVoiceId);
      setIncludeSettings(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setIncludeVoice(!!referenceVoiceId);
    setIncludeSettings(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const truncate = (text: string, max: number) => {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content save-config-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Save Text Configuration</h3>
          <button type="button" onClick={handleClose} className="modal-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="config-name">Name *</label>
            <input
              id="config-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter a name for this config..."
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="config-description">Description</label>
            <textarea
              id="config-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="save-config-preview">
            <h4>What will be saved:</h4>
            <div className="preview-item">
              <span className="preview-label">Reference Text:</span>
              <span className="preview-value">
                {referenceText ? truncate(referenceText, 50) : "(empty)"}
              </span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Input Text:</span>
              <span className="preview-value">
                {inputText ? truncate(inputText, 50) : "(empty)"}
              </span>
            </div>
          </div>

          {referenceVoiceId && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeVoice}
                onChange={e => setIncludeVoice(e.target.checked)}
              />
              <span>Link to voice "{referenceVoiceName}"</span>
            </label>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeSettings}
              onChange={e => setIncludeSettings(e.target.checked)}
            />
            <span>Include current generation settings ({settings.preset})</span>
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={handleClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}
