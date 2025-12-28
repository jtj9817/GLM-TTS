import { useState, useRef, useEffect } from "react";
import { WaveformVisualizer } from "../WaveformVisualizer";

interface CardAction {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

interface MediaCardProps {
  type: "output" | "reference" | "preset";
  title: string;
  subtitle?: string;
  date: number;
  duration?: number;
  audioUrl?: string;
  metadata?: { label: string; value: string }[];
  tags?: { label: string; variant?: "default" | "primary" | "accent" }[];
  actions: CardAction[];
  onPlay?: () => void;
  onPause?: () => void;
  isPlaying?: boolean;
  showWaveform?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const PRESET_COLORS: Record<string, string> = {
  balanced: "#667eea",
  expressive: "#764ba2",
  stable: "#22c55e",
  ultra_stable: "#16a34a",
  creative: "#f59e0b",
  fast: "#06b6d4",
  longform: "#8b5cf6",
  pronunciation: "#ec4899",
  low_repetition: "#14b8a6",
  sensual: "#f43f5e",
  asmr: "#d946ef",
  custom: "#6b7280",
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

function generateCoverGradient(seed: string, preset?: string): string {
  const presetColor = preset ? PRESET_COLORS[preset] || PRESET_COLORS.custom : PRESET_COLORS.balanced;
  // Create a unique rotation based on the seed
  const hashCode = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const angle = hashCode % 360;
  return `linear-gradient(${angle}deg, ${presetColor}22 0%, ${presetColor}44 50%, ${presetColor}66 100%)`;
}

export function MediaCard({
  type,
  title,
  subtitle,
  date,
  duration,
  audioUrl,
  metadata,
  tags,
  actions,
  onPlay,
  onPause,
  isPlaying = false,
  showWaveform = false,
  isLoading = false,
  children,
}: MediaCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);

  // Use local playing state if no external control
  const effectivePlaying = onPlay ? isPlaying : localPlaying;

  const handlePlayClick = () => {
    if (onPlay && onPause) {
      if (effectivePlaying) {
        onPause();
      } else {
        onPlay();
      }
    } else if (audioRef.current) {
      if (localPlaying) {
        audioRef.current.pause();
        setLocalPlaying(false);
      } else {
        audioRef.current.play().catch(() => {});
        setLocalPlaying(true);
      }
    }
  };

  // Sync audio element with playing state
  useEffect(() => {
    if (audioRef.current && !onPlay) {
      if (localPlaying) {
        audioRef.current.play().catch(() => setLocalPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [localPlaying, onPlay]);

  const coverStyle = {
    background: generateCoverGradient(title + date, tags?.[0]?.label?.toLowerCase()),
  };

  return (
    <div
      className={`media-card media-card--${type} ${isHovered ? "media-card--hovered" : ""} ${isLoading ? "media-card--loading" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Cover Art Area */}
      <div className="media-card__cover" style={coverStyle}>
        {audioUrl && showWaveform ? (
          <div className="media-card__waveform">
            <WaveformVisualizer audioUrl={audioUrl} height={80} />
          </div>
        ) : (
          <div className="media-card__cover-icon">
            {type === "output" && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            )}
            {type === "reference" && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            {type === "preset" && (
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
            )}
          </div>
        )}

        {/* Play Button Overlay */}
        {audioUrl && (
          <button
            className={`media-card__play-btn ${effectivePlaying ? "playing" : ""}`}
            onClick={handlePlayClick}
            title={effectivePlaying ? "Pause" : "Play"}
          >
            {effectivePlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        )}

        {/* Duration Badge */}
        {duration !== undefined && (
          <span className="media-card__duration">{formatDuration(duration)}</span>
        )}
      </div>

      {/* Card Content */}
      <div className="media-card__content">
        <h3 className="media-card__title" title={title}>
          {title.slice(0, 80)}{title.length > 80 ? "..." : ""}
        </h3>

        {subtitle && (
          <p className="media-card__subtitle" title={subtitle}>
            {subtitle.slice(0, 60)}{subtitle.length > 60 ? "..." : ""}
          </p>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="media-card__tags">
            {tags.map((tag, i) => (
              <span
                key={i}
                className={`media-card__tag media-card__tag--${tag.variant || "default"}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        {metadata && metadata.length > 0 && (
          <div className="media-card__metadata">
            {metadata.map((item, i) => (
              <span key={i} className="media-card__meta-item">
                <span className="media-card__meta-label">{item.label}:</span>
                <span className="media-card__meta-value">{item.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* Date */}
        <span className="media-card__date">{formatDate(date)}</span>

        {/* Custom children */}
        {children}
      </div>

      {/* Actions */}
      <div className="media-card__actions">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`media-card__action media-card__action--${action.variant || "secondary"}`}
            title={action.label}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Hidden audio element for local playback */}
      {audioUrl && !onPlay && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setLocalPlaying(false)}
          onError={() => setLocalPlaying(false)}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
