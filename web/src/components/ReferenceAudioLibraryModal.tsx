import { useState, useEffect } from "react";
import type { ReferenceAudioEntry } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (entry: ReferenceAudioEntry) => void;
  library: ReferenceAudioEntry[];
  onDelete: (id: string) => void;
  onSave: (entry: ReferenceAudioEntry) => void;
}

type SortBy = "date" | "name" | "duration";

export function ReferenceAudioLibraryModal({
  isOpen,
  onClose,
  onSelect,
  library,
  onDelete,
  onSave,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setPlayingId(null);
      setEditingId(null);
    }
  }, [isOpen]);

  // Filter and sort library
  const filteredLibrary = library
    .filter(entry => {
      const query = searchQuery.toLowerCase();
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.transcript.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "duration":
          return (a.duration || 0) - (b.duration || 0);
        case "date":
        default:
          return b.createdAt - a.createdAt;
      }
    });

  const handlePlay = (id: string) => {
    setPlayingId(prev => (prev === id ? null : id));
  };

  const handleStartEdit = (entry: ReferenceAudioEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
  };

  const handleSaveEdit = (entry: ReferenceAudioEntry) => {
    if (!editName.trim()) return;
    onSave({ ...entry, name: editName.trim() });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reference Audio Library</h2>
          <button onClick={onClose} className="btn-close" type="button">
            ✕
          </button>
        </div>

        <div className="library-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by name or transcript..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="search-clear"
                type="button"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="sort-select"
          >
            <option value="date">Sort by Date (newest)</option>
            <option value="name">Sort by Name</option>
            <option value="duration">Sort by Duration</option>
          </select>
        </div>

        <div className="library-stats">
          <span>
            {filteredLibrary.length} {filteredLibrary.length === 1 ? "item" : "items"}
          </span>
          {searchQuery && (
            <span className="library-filter-hint">
              (filtered from {library.length})
            </span>
          )}
        </div>

        <div className="library-items">
          {filteredLibrary.length === 0 ? (
            <div className="library-empty">
              {searchQuery
                ? "No matching audio found"
                : library.length === 0
                  ? "No saved reference audio yet. Upload and save audio to build your library."
                  : "No audio found"}
            </div>
          ) : (
            <div className="library-grid">
              {filteredLibrary.map(entry => (
                <div key={entry.id} className="library-card">
                  <div className="library-card-header">
                    {editingId === entry.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="library-name-edit"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter") handleSaveEdit(entry);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                    ) : (
                      <h3 className="library-card-name">{entry.name}</h3>
                    )}
                    <div className="library-card-meta">
                      {entry.duration && (
                        <span className="library-card-duration">
                          {formatDuration(entry.duration)}
                        </span>
                      )}
                      <span className="library-card-date">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  </div>

                  {entry.transcript && (
                    <p className="library-card-transcript" title={entry.transcript}>
                      "{entry.transcript.slice(0, 80)}
                      {entry.transcript.length > 80 ? "..." : ""}"
                    </p>
                  )}

                  <div className="library-card-audio">
                    <audio
                      controls
                      src={URL.createObjectURL(entry.audioBlob)}
                      className="library-audio-player"
                      onPlay={() => setPlayingId(entry.id)}
                      onPause={() => setPlayingId(null)}
                      onEnded={() => setPlayingId(null)}
                    />
                  </div>

                  <div className="library-card-actions">
                    {editingId === entry.id ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(entry)}
                          className="btn-save"
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
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
                          className="btn-primary"
                          type="button"
                        >
                          Use This
                        </button>
                        <button
                          onClick={() => handleStartEdit(entry)}
                          className="btn-secondary"
                          type="button"
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${entry.name}" from library?`)) {
                              onDelete(entry.id);
                            }
                          }}
                          className="btn-delete"
                          type="button"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
