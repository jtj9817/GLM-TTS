import { useState, useEffect } from "react";
import { useParams, Navigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { LibrarySidebar } from "../layout/LibrarySidebar";
import { OutputsPanel } from "./OutputsPanel";
import { ReferencesPanel } from "./ReferencesPanel";
import { PresetsPanel } from "./PresetsPanel";
import { MiniPlayer } from "./MiniPlayer";

type CategoryType = "outputs" | "references" | "presets";

const validCategories: CategoryType[] = ["outputs", "references", "presets"];

export function LibraryPage() {
  const { category } = useParams<{ category: string }>();
  const { generations, referenceLibrary, nowPlaying } = useApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Redirect to outputs if no category or invalid category
  if (!category || !validCategories.includes(category as CategoryType)) {
    return <Navigate to="/library/outputs" replace />;
  }

  const activeCategory = category as CategoryType;

  // We don't have a way to get presets count without loading them
  // The PresetsPanel will handle its own loading
  const counts = {
    outputs: generations.length,
    references: referenceLibrary.length,
    presets: 0, // Will be updated by PresetsPanel
  };

  return (
    <div className={`library-page ${nowPlaying ? "has-mini-player" : ""}`}>
      <LibrarySidebar
        counts={counts}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="library-main">
        <div className="library-header">
          <h1 className="library-title">
            {activeCategory === "outputs" && "Generated Outputs"}
            {activeCategory === "references" && "Reference Audio"}
            {activeCategory === "presets" && "Saved Presets"}
          </h1>
          <p className="library-description">
            {activeCategory === "outputs" && "Browse and manage your generated speech audio files"}
            {activeCategory === "references" && "Manage your saved voice reference samples"}
            {activeCategory === "presets" && "Load and manage your saved generation settings"}
          </p>
        </div>

        {activeCategory === "outputs" && <OutputsPanel />}
        {activeCategory === "references" && <ReferencesPanel />}
        {activeCategory === "presets" && <PresetsPanel />}
      </main>

      <MiniPlayer />
    </div>
  );
}
