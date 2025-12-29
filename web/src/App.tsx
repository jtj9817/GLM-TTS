import { Routes, Route, Navigate } from "react-router";
import "./index.css";
import { Navbar } from "./components/layout/Navbar";
import { SynthesisPage } from "./components/synthesis/SynthesisPage";
import { LibraryPage } from "./components/library/LibraryPage";
import { useApp } from "./context/AppContext";

export function App() {
  const { error } = useApp();

  return (
    <div className="app-shell">
      <Navbar />

      {error && (
        <div className="global-error">
          <span>{error}</span>
        </div>
      )}

      <div className="app-content">
        <Routes>
          <Route path="/" element={<SynthesisPage />} />
          <Route path="/library" element={<Navigate to="/library/outputs" replace />} />
          <Route path="/library/:category" element={<LibraryPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
