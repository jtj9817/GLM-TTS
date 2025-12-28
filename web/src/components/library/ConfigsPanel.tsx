import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import type { GenerationConfigEntry } from "../../types";

type SortOption = "newest" | "oldest" | "name";
type FilterType = "all" | "with-voice" | "text-only";

export function ConfigsPanel() {
  const navigate = useNavigate();
  const {
    generationConfigs,
    referenceLibrary,
    loadGenerationConfig,
    deleteGenerationConfig,
    updateGenerationConfig,
  } = useApp();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Add voice existence status to configs
  const configsWithStatus = useMemo(() => {
    return generationConfigs.map(config => ({
      ...config,
      voiceExists: config.referenceVoiceId
        ? referenceLibrary.some(r => r.id === config.referenceVoiceId)
        : null,
    }));
  }, [generationConfigs, referenceLibrary]);

  const filtered = useMemo(() => {
    let items = [...configsWithStatus];

    // Search
    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query) ||
          c.referenceText.toLowerCase().includes(query) ||
          c.inputText.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (filterType === "with-voice") {
      items = items.filter(c => c.referenceVoiceId);
    } else if (filterType === "text-only") {
      items = items.filter(c => !c.referenceVoiceId);
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.createdAt - b.createdAt;
        case "name":
          return a.name.localeCompare(b.name);
        case "newest":
        default:
          return b.createdAt - a.createdAt;
      }
    });

    return items;
  }, [configsWithStatus, search, sortBy, filterType]);

  const handleUse = (config: GenerationConfigEntry) => {
    loadGenerationConfig(config);
    navigate("/");
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      await deleteGenerationConfig(id);
    }
  };

  const startEdit = (config: GenerationConfigEntry & { voiceExists: boolean | null }) => {
    setEditingId(config.id);
    setEditName(config.name);
    setEditDescription(config.description || "");
  };

  const saveEdit = async (config: GenerationConfigEntry) => {
    if (editName.trim()) {
      await updateGenerationConfig({
        ...config,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
    }
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
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
            placeholder="Search configs..."
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
            value={filterType}
            onChange={e => setFilterType(e.target.value as FilterType)}
            className="library-filter"
          >
            <option value="all">All Configs</option>
            <option value="with-voice">With Voice</option>
            <option value="text-only">Text Only</option>
          </select>

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
        </div>
      </div>

      <div className="library-stats">
        <span className="stats-count">{filtered.length} of {generationConfigs.length} configs</span>
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3>{search || filterType !== "all" ? "No matching configs" : "No saved configs"}</h3>
          <p>
            {search || filterType !== "all"
              ? "Try a different search term or filter"
              : "Save your text configurations in the Studio to quickly reuse them"}
          </p>
          {!search && filterType === "all" && (
            <button onClick={() => navigate("/")} className="btn-primary">
              Go to Studio
            </button>
          )}
        </div>
      ) : (
        <div className={`library-grid library-grid--${viewMode}`}>
          {filtered.map(config => (
            <div key={config.id} className={`config-card ${viewMode === "list" ? "config-card--list" : ""}`}>
              {editingId === config.id ? (
                <div className="config-card-edit">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="edit-name-input"
                    autoFocus
                    placeholder="Config name..."
                    onKeyDown={e => {
                      if (e.key === "Enter") saveEdit(config);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className="edit-description-input"
                    placeholder="Description (optional)..."
                    rows={2}
                  />
                  <div className="config-card-actions">
                    <button onClick={() => saveEdit(config)} className="btn-primary btn-sm">
                      Save
                    </button>
                    <button onClick={cancelEdit} className="btn-secondary btn-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="config-card-header">
                    <div className="config-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div className="config-card-title-section">
                      <h3 className="config-card-title">{config.name}</h3>
                      {config.description && (
                        <p className="config-card-description">{config.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="config-card-tags">
                    {config.referenceVoiceId ? (
                      <span className={`config-tag ${config.voiceExists ? "config-tag--voice" : "config-tag--missing"}`}>
                        {config.voiceExists ? config.referenceVoiceName : "Voice Missing"}
                      </span>
                    ) : (
                      <span className="config-tag config-tag--text">Text Only</span>
                    )}
                    {config.includeSettings && (
                      <span className="config-tag config-tag--settings">With Settings</span>
                    )}
                  </div>

                  <div className="config-card-preview">
                    <div className="preview-section">
                      <span className="preview-label">Reference:</span>
                      <span className="preview-text">{truncateText(config.referenceText, 60) || "(empty)"}</span>
                    </div>
                    <div className="preview-section">
                      <span className="preview-label">Input:</span>
                      <span className="preview-text">{truncateText(config.inputText, 60) || "(empty)"}</span>
                    </div>
                  </div>

                  <div className="config-card-meta">
                    <span className="config-date">{formatDate(config.createdAt)}</span>
                  </div>

                  <div className="config-card-actions">
                    <button onClick={() => handleUse(config)} className="btn-primary btn-sm">
                      Use This
                    </button>
                    <button onClick={() => startEdit(config)} className="btn-secondary btn-sm">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(config.id, config.name)} className="btn-danger btn-sm">
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
