import { NavLink } from "react-router";
import { useApp } from "../../context/AppContext";

export function Navbar() {
  const { serverStatus, statusChecked, checkServerHealth, setSettingsOpen, settingsOpen } = useApp();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1 className="navbar-title">GLM-TTS</h1>
        <span className="navbar-subtitle">Studio</span>
      </div>

      <div className="navbar-links">
        <NavLink
          to="/"
          className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
          end
        >
          <svg className="navbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>Studio</span>
        </NavLink>
        <NavLink
          to="/library"
          className={({ isActive }) => `navbar-link ${isActive ? "active" : ""}`}
        >
          <svg className="navbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>Library</span>
        </NavLink>
      </div>

      <div className="navbar-actions">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`navbar-btn ${settingsOpen ? "active" : ""}`}
          title="Settings"
        >
          <svg className="navbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          onClick={checkServerHealth}
          className="navbar-btn"
          title="Check Server Status"
        >
          <svg className="navbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </button>
        {statusChecked && (
          <div className={`navbar-status ${serverStatus?.status === "healthy" ? "healthy" : "error"}`}>
            <span className="navbar-status-dot" />
            {serverStatus?.status === "healthy" ? (
              <span className="navbar-status-text">{serverStatus.device}</span>
            ) : (
              <span className="navbar-status-text">Offline</span>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
