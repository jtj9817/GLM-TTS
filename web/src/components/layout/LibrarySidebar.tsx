import { NavLink } from "react-router";

interface LibrarySidebarProps {
  counts: {
    outputs: number;
    references: number;
    presets: number;
  };
  collapsed?: boolean;
  onToggle?: () => void;
}

export function LibrarySidebar({ counts, collapsed = false, onToggle }: LibrarySidebarProps) {
  return (
    <aside className={`library-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && <h2>Library</h2>}
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            {collapsed ? (
              <path d="M9 18l6-6-6-6" />
            ) : (
              <path d="M15 18l-6-6 6-6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/library/outputs"
          className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
        >
          <div className="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          {!collapsed && (
            <>
              <span className="sidebar-label">Outputs</span>
              {counts.outputs > 0 && (
                <span className="sidebar-count">{counts.outputs}</span>
              )}
            </>
          )}
        </NavLink>

        <NavLink
          to="/library/references"
          className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
        >
          <div className="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          {!collapsed && (
            <>
              <span className="sidebar-label">References</span>
              {counts.references > 0 && (
                <span className="sidebar-count">{counts.references}</span>
              )}
            </>
          )}
        </NavLink>

        <NavLink
          to="/library/presets"
          className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
        >
          <div className="sidebar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          {!collapsed && (
            <>
              <span className="sidebar-label">Presets</span>
              {counts.presets > 0 && (
                <span className="sidebar-count">{counts.presets}</span>
              )}
            </>
          )}
        </NavLink>
      </nav>

      {!collapsed && (
        <div className="sidebar-footer">
          <p className="sidebar-tip">
            Browse and manage your generated audio, voice samples, and saved presets.
          </p>
        </div>
      )}
    </aside>
  );
}
