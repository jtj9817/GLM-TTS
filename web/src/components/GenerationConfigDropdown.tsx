import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import type { GenerationConfigEntry } from "../types";

interface GenerationConfigDropdownProps {
  onSelect: (config: GenerationConfigEntry) => void;
  onSave: () => void;
}

export function GenerationConfigDropdown({ onSelect, onSave }: GenerationConfigDropdownProps) {
  const navigate = useNavigate();
  const { generationConfigs, referenceLibrary } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Filter configs with search
  const filtered = useMemo(() => {
    let items = [...generationConfigs];

    if (search.trim()) {
      const query = search.toLowerCase();
      items = items.filter(c => c.name.toLowerCase().includes(query));
    }

    // Limit to 10 items
    return items.slice(0, 10);
  }, [generationConfigs, search]);

  const handleSelect = (config: GenerationConfigEntry) => {
    onSelect(config);
    setIsOpen(false);
    setSearch("");
  };

  const checkVoiceExists = (config: GenerationConfigEntry) => {
    if (!config.referenceVoiceId) return null;
    return referenceLibrary.some(r => r.id === config.referenceVoiceId);
  };

  return (
    <div className="config-dropdown" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="config-dropdown-trigger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>Configs</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          width="14"
          height="14"
          className={`dropdown-chevron ${isOpen ? "open" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="config-dropdown-menu">
          <div className="config-dropdown-search">
            <input
              type="text"
              placeholder="Search configs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="config-dropdown-items">
            {filtered.length === 0 ? (
              <div className="config-dropdown-empty">
                {generationConfigs.length === 0 ? "No saved configs" : "No matching configs"}
              </div>
            ) : (
              filtered.map(config => {
                const voiceExists = checkVoiceExists(config);
                return (
                  <button
                    key={config.id}
                    type="button"
                    onClick={() => handleSelect(config)}
                    className="config-dropdown-item"
                  >
                    <div className="item-content">
                      <span className="item-name">{config.name}</span>
                      <span className="item-preview">
                        {config.inputText.slice(0, 40)}
                        {config.inputText.length > 40 ? "..." : ""}
                      </span>
                    </div>
                    {config.referenceVoiceId && (
                      <span className={`item-voice-badge ${voiceExists ? "" : "missing"}`}>
                        {voiceExists ? config.referenceVoiceName : "Missing"}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="config-dropdown-footer">
            <button type="button" onClick={onSave} className="dropdown-action-btn save">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Save Current
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate("/library/configs");
              }}
              className="dropdown-action-btn manage"
            >
              Manage All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
