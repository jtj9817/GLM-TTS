import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { MediaCard } from "./MediaCard";
import type { ReferenceAudioEntry } from "../../types";

type SortOption = "newest" | "oldest" | "name" | "duration";

export function ReferencesPanel() {
  const navigate = useNavigate();
  const {
    referenceLibrary,
    loadReferenceFromLibrary,
    deleteFromLibrary,
    updateLibraryEntry,
    playAudio,
    pauseAudio,
    nowPlaying,
    isPlaying,
  } = useApp();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Manage object URLs for audio blobs
  const audioUrlsRef = useRef<Map<string, string>>(new Map());

  const getAudioUrl = (entry: ReferenceAudioEntry): string => {
    if (!audioUrlsRef.current.has(entry.id)) {
      audioUrlsRef.current.set(entry.id, URL.createObjectURL(entry.audioBlob));
    }
    return audioUrlsRef.current.get(entry.id)!;
  };

  // Cleanup URLs when references change
  useEffect(() => {
    const currentIds = new Set(referenceLibrary.map(r => r.id));
    audioUrlsRef.current.forEach((url, id) => {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        audioUrlsRef.current.delete(id);
      }
    });
  }, [referenceLibrary]);

  // Cleanup all URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      audioUrlsRef.current.clear();
    };
  }, []);

  const filtered = useMemo(() => {
    let items = [...referenceLibrary];

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
  }, [referenceLibrary, search, sortBy]);

  const handleUse = (entry: ReferenceAudioEntry) => {
    loadReferenceFromLibrary(entry);
    navigate("/");
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      await deleteFromLibrary(id);
    }
  };

  const startEdit = (entry: ReferenceAudioEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
  };

  const saveEdit = async (entry: ReferenceAudioEntry) => {
    if (editName.trim()) {
      await updateLibraryEntry({ ...entry, name: editName.trim() });
    }
    setEditingId(null);
    setEditName("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handlePlay = (entry: ReferenceAudioEntry) => {
    const url = getAudioUrl(entry);
    playAudio(entry.id, "reference", url, entry.name);
  };

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
            placeholder="Search by name or transcript..."
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
            <option value="duration">Duration</option>
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
        </div>
      </div>

      <div className="library-stats">
        <span className="stats-count">{filtered.length} of {referenceLibrary.length} reference audios</span>
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h3>{search ? "No matching references" : "No saved references"}</h3>
          <p>
            {search
              ? "Try a different search term"
              : "Upload audio in the Studio and click 'Save to Library' to add voice samples here"}
          </p>
          {!search && (
            <button onClick={() => navigate("/")} className="btn-primary">
              Go to Studio
            </button>
          )}
        </div>
      ) : (
        <div className={`library-grid library-grid--${viewMode}`}>
          {filtered.map(entry => (
            <MediaCard
              key={entry.id}
              type="reference"
              title={editingId === entry.id ? "" : entry.name}
              subtitle={entry.transcript ? `"${entry.transcript}"` : undefined}
              date={entry.createdAt}
              duration={entry.duration}
              audioUrl={getAudioUrl(entry)}
              isPlaying={nowPlaying?.id === entry.id && isPlaying}
              onPlay={() => handlePlay(entry)}
              onPause={pauseAudio}
              actions={
                editingId === entry.id
                  ? [
                      {
                        label: "Save",
                        onClick: () => saveEdit(entry),
                        variant: "primary",
                      },
                      {
                        label: "Cancel",
                        onClick: cancelEdit,
                        variant: "secondary",
                      },
                    ]
                  : [
                      {
                        label: "Use This",
                        onClick: () => handleUse(entry),
                        variant: "primary",
                      },
                      {
                        label: "Rename",
                        onClick: () => startEdit(entry),
                        variant: "secondary",
                      },
                      {
                        label: "Delete",
                        onClick: () => handleDelete(entry.id, entry.name),
                        variant: "danger",
                      },
                    ]
              }
            >
              {editingId === entry.id && (
                <div className="card-edit-name">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="edit-name-input"
                    autoFocus
                    placeholder="Enter name..."
                    onKeyDown={e => {
                      if (e.key === "Enter") saveEdit(entry);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                </div>
              )}
            </MediaCard>
          ))}
        </div>
      )}
    </div>
  );
}
