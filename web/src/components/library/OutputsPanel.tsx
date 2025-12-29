import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { MediaCard } from "./MediaCard";
import type { Generation } from "../../types";

type SortOption = "newest" | "oldest" | "length";

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

export function OutputsPanel() {
  const navigate = useNavigate();
  const {
    generations,
    deleteGeneration,
    exportGeneration,
    exportingId,
    waveformEnabled,
    setWaveformEnabled,
    ffmpegLoaded,
    ffmpegLoading,
    selectedFormat,
    setSelectedFormat,
    convertAndDownload,
    convertingId,
    playAudio,
    pauseAudio,
    nowPlaying,
    isPlaying,
  } = useApp();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    let items = [...generations];

    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(
        g =>
          g.input_text.toLowerCase().includes(query) ||
          (g.reference_text && g.reference_text.toLowerCase().includes(query))
      );
    }

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

  const handleDelete = async (id: string) => {
    if (confirm("Delete this generation?")) {
      await deleteGeneration(id);
    }
  };

  const handlePlay = (gen: Generation) => {
    playAudio(gen.id, "output", gen.audio_url, gen.input_text.slice(0, 50));
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
            placeholder="Search outputs..."
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
            <option value="length">Text Length</option>
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

          <label className="library-toggle-checkbox">
            <input
              type="checkbox"
              checked={waveformEnabled}
              onChange={e => setWaveformEnabled(e.target.checked)}
            />
            <span>Waveforms</span>
          </label>
        </div>
      </div>

      <div className="library-stats">
        <span className="stats-count">{filtered.length} of {generations.length} outputs</span>
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h3>{search ? "No matching outputs" : "No outputs yet"}</h3>
          <p>
            {search
              ? "Try a different search term"
              : "Generate some speech in the Studio to see it here"}
          </p>
          {!search && (
            <button onClick={() => navigate("/")} className="btn-primary">
              Go to Studio
            </button>
          )}
        </div>
      ) : (
        <div className={`library-grid library-grid--${viewMode}`}>
          {filtered.map(gen => (
            <MediaCard
              key={gen.id}
              type="output"
              title={gen.input_text}
              subtitle={gen.reference_text ? `Ref: "${gen.reference_text}"` : undefined}
              date={gen.created_at}
              audioUrl={gen.audio_url}
              showWaveform={waveformEnabled}
              isPlaying={nowPlaying?.id === gen.id && isPlaying}
              onPlay={() => handlePlay(gen)}
              onPause={pauseAudio}
              tags={[
                ...(gen.settings?.preset
                  ? [{ label: PRESET_LABELS[gen.settings.preset] || gen.settings.preset, variant: "primary" as const }]
                  : []),
              ]}
              metadata={[
                ...(gen.seed !== null ? [{ label: "Seed", value: String(gen.seed) }] : []),
              ]}
              isLoading={exportingId === gen.id || convertingId === gen.id}
              actions={[
                {
                  label: "WAV",
                  onClick: () => {
                    const link = document.createElement("a");
                    link.href = gen.audio_url;
                    link.download = gen.output_filename;
                    link.click();
                  },
                  variant: "secondary",
                },
                {
                  label: exportingId === gen.id ? "..." : "ZIP",
                  onClick: () => exportGeneration(gen),
                  disabled: exportingId === gen.id,
                  variant: "secondary",
                },
                ...(ffmpegLoaded && selectedFormat !== "wav"
                  ? [
                      {
                        label: convertingId === gen.id ? "..." : selectedFormat.toUpperCase(),
                        onClick: () => convertAndDownload(gen, selectedFormat as "mp3" | "flac" | "ogg"),
                        disabled: convertingId === gen.id,
                        variant: "secondary" as const,
                      },
                    ]
                  : []),
                {
                  label: "Delete",
                  onClick: () => handleDelete(gen.id),
                  variant: "danger",
                },
              ]}
            >
              {ffmpegLoaded && (
                <div className="card-format-select">
                  <select
                    value={selectedFormat}
                    onChange={e => setSelectedFormat(e.target.value as typeof selectedFormat)}
                    className="format-select"
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="wav">WAV</option>
                    <option value="mp3">MP3</option>
                    <option value="flac">FLAC</option>
                    <option value="ogg">OGG</option>
                  </select>
                </div>
              )}
              {ffmpegLoading && !ffmpegLoaded && (
                <span className="converter-status">Loading converter...</span>
              )}
            </MediaCard>
          ))}
        </div>
      )}
    </div>
  );
}
