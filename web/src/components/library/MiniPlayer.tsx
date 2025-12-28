import { useState, useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function MiniPlayer() {
  const {
    nowPlaying,
    isPlaying,
    pauseAudio,
    resumeAudio,
    stopAudio,
    audioRef,
  } = useApp();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Update time display
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [audioRef, nowPlaying]);

  // Handle seek
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * duration;
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  if (!nowPlaying) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini-player">
      {/* Progress bar at top */}
      <div
        className="mini-player__progress"
        ref={progressRef}
        onClick={handleProgressClick}
      >
        <div
          className="mini-player__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mini-player__content">
        {/* Track info */}
        <div className="mini-player__info">
          <div className="mini-player__icon">
            {nowPlaying.type === "output" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            )}
          </div>
          <div className="mini-player__text">
            <span className="mini-player__title">{nowPlaying.title}</span>
            <span className="mini-player__type">
              {nowPlaying.type === "output" ? "Generated Output" : "Reference Audio"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="mini-player__controls">
          <button
            className="mini-player__btn mini-player__btn--play"
            onClick={isPlaying ? pauseAudio : resumeAudio}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
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
        </div>

        {/* Time display */}
        <div className="mini-player__time">
          <span>{formatTime(currentTime)}</span>
          <span className="mini-player__time-separator">/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Volume control */}
        <div className="mini-player__volume-wrapper">
          <button
            className="mini-player__btn mini-player__btn--volume"
            onClick={() => setShowVolume(!showVolume)}
            title="Volume"
          >
            {volume === 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
          {showVolume && (
            <div className="mini-player__volume-slider">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
              />
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          className="mini-player__btn mini-player__btn--close"
          onClick={stopAudio}
          title="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
