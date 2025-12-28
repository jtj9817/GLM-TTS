# GLM-TTS Web Frontend - Comprehensive Feature Implementation Plan

## Executive Summary

This document outlines the implementation of **14 major features** for the GLM-TTS web application, organized into **6 logical phases**. The plan leverages existing patterns (React 19, Bun, SQLite, localStorage) with minimal new dependencies.

**Total estimated effort**: 15-20 hours of development
**Target audience**: Personal usage
**Deployment**: Local development environment

---

## Table of Contents

1. [Features Overview](#features-overview)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Architecture Decisions](#architecture-decisions)
4. [Implementation Phases](#implementation-phases)
5. [Dependencies](#dependencies)
6. [Database Schema Changes](#database-schema-changes)
7. [Testing Strategy](#testing-strategy)
8. [Risk Assessment](#risk-assessment)
9. [Rollback Plan](#rollback-plan)
10. [Success Metrics](#success-metrics)

---

## Features Overview

### Phase 1: Quick Wins (3-4 hours)
1. **Random Seed Button** - Add randomize button for quick seed generation
2. **Delete Individual Generations** - Remove single outputs with file cleanup
3. **Text Character Count** - Display count + estimated generation time
4. **Auto-scroll to Output** - Scroll to new audio after generation

### Phase 2: Storage Management (3-4 hours)
5. **Persist Reference Audio** - IndexedDB storage for reference audio files
6. **Bulk Delete/Cleanup** - Mass deletion with storage usage display

### Phase 3: UX Improvements (2-3 hours)
7. **Drag-and-Drop Audio** - Drag reference audio files to upload
8. **Export Settings with Audio** - Download zip with audio + JSON metadata

### Phase 4: Discoverability (1-2 hours)
9. **Preset Tooltips** - Helpful descriptions for each preset

### Phase 5: Batch Operations (3-4 hours)
10. **Generation Queue** - Queue multiple synthesis requests

### Phase 6: Advanced Features (4-5 hours)
11. **Waveform Visualization** - Canvas-based audio waveform display
12. **Reference Audio Library** - Persistent library with search/filter
13. **Audio Format Options** - MP3/FLAC conversion using ffmpeg.wasm
14. **Saved Configurations** - Save/load preset + settings combinations

---

## Current Architecture Analysis

### Technology Stack
- **Frontend**: React 19 with TypeScript (single 720-line App.tsx)
- **Server**: Bun.serve() with built-in routing (no Express)
- **Database**: bun:sqlite with WAL mode enabled
- **Storage**: `web/data/audio/*.wav` (currently 104MB, 41 files)
- **Styling**: Vanilla CSS with dark gradient theme
- **Build**: Bun's native bundler

### File Structure
```
web/src/
├── index.html          # Entry HTML
├── frontend.tsx        # React entry point
├── App.tsx            # Main component (720 lines) ⚠️ Needs refactoring
├── index.ts           # Bun server + API routes
├── index.css          # Global styles
└── server/
    ├── db.ts          # SQLite database setup
    ├── storage.ts     # File storage utilities
    └── session.ts     # Session management
```

### Current Database Schema

**sessions**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
```

**generations**
```sql
CREATE TABLE generations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  input_text TEXT NOT NULL,
  reference_text TEXT,
  seed INTEGER,
  audio_path TEXT NOT NULL,
  audio_mime TEXT NOT NULL,
  output_filename TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_generations_session_created_at
  ON generations(session_id, created_at DESC);
```

### Current Pain Points
1. ✗ No storage visibility (104MB hidden)
2. ✗ No cleanup mechanism (files persist forever)
3. ✗ No reference audio persistence (re-upload every session)
4. ✗ No batch operations
5. ✗ No time estimation before generation
6. ✗ Settings must be manually recreated

---

## Architecture Decisions

### Decision 1: Component Refactoring

**Problem**: App.tsx is 720 lines and growing
**Solution**: Extract components into dedicated files

```
web/src/components/
├── ReferenceAudioLibrary.tsx    # Feature 12
├── GenerationQueue.tsx          # Feature 10
├── WaveformVisualizer.tsx       # Feature 11
├── GenerationItem.tsx           # Features 2, 8, 13
├── SettingsPanel.tsx            # Features 9, 14
├── TextInput.tsx                # Feature 3
└── StorageManager.tsx           # Feature 6

web/src/hooks/
├── useIndexedDB.ts              # Feature 5
├── useQueue.ts                  # Feature 10
└── useAudioExport.ts            # Features 8, 13

web/src/utils/
├── audioConverter.ts            # Feature 13
├── timeEstimator.ts             # Feature 3
└── presetDescriptions.ts        # Feature 9

web/src/types/
└── index.ts                     # Shared TypeScript types
```

**Rationale**:
- Maintainability (smaller, focused files)
- Testability (isolated components)
- Reusability (shared hooks)
- Performance (lazy loading)

---

### Decision 2: Reference Audio Storage Strategy

**Options Considered**:
1. localStorage → ❌ 5-10MB limit (too small)
2. File System Access API → ❌ Chrome-only
3. IndexedDB → ✅ **SELECTED**

**Why IndexedDB?**
- Supports large blobs (50MB+ per file)
- Browser support >95% (Chrome, Firefox, Safari, Edge)
- No backend changes required
- Async API with good performance

**Schema**:
```typescript
interface ReferenceAudioEntry {
  id: string;              // UUID
  name: string;            // User-friendly name
  audioBlob: Blob;         // Actual audio data
  transcript: string;      // Reference text
  createdAt: number;       // Timestamp
  duration?: number;       // Audio duration (seconds)
  waveform?: number[];     // Cached waveform data for visualization
}
```

**Database Name**: `glmtts`
**Object Store**: `referenceAudio`
**Key Path**: `id`

---

### Decision 3: Generation Queue Architecture

**Options Considered**:
1. Backend queue (Python) → ❌ Increases complexity
2. Client-side queue with polling → ❌ Inefficient
3. Client-side queue with sequential processing → ✅ **SELECTED**

**Why Client-Side Sequential?**
- No backend changes required
- Simple React state management
- Prevents server overload
- Better UX feedback (progress per item)
- Easy to implement pause/resume

**Queue State**:
```typescript
interface QueueItem {
  id: string;                    // UUID
  text: string;                  // Input text
  referenceAudioId: string;      // Reference to library entry
  settings: GenerationSettings;  // Generation parameters
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;                // Error message if failed
  resultId?: string;             // Generation ID when complete
  addedAt: number;               // Timestamp
}
```

**Processing Logic**:
- Sequential execution (one at a time)
- 1-second delay between items
- Error isolation (one failure doesn't stop queue)
- Optional persistence to localStorage

---

### Decision 4: Audio Format Conversion

**Options Considered**:
1. Backend ffmpeg (Python) → ❌ Requires Python dependencies
2. Web Audio API → ❌ Limited format support
3. ffmpeg.wasm (WebAssembly) → ✅ **SELECTED**

**Why ffmpeg.wasm?**
- No backend changes
- Works offline
- Full ffmpeg functionality (MP3, FLAC, OGG, etc.)
- Active maintenance
- Lazy loading reduces initial bundle size

**Trade-offs**:
- ✅ Pros: Full format support, client-side processing, no server load
- ⚠️ Cons: Large bundle (~25MB), slower than native ffmpeg

**Supported Conversions**:
- WAV → MP3 (lossy, ~10x compression)
- WAV → FLAC (lossless, ~2x compression)
- WAV → OGG (lossy, ~12x compression)

---

### Decision 5: Waveform Visualization

**Options Considered**:
1. wavesurfer.js → ❌ 180KB bundle, too heavy
2. peaks.js → ❌ Overkill for simple visualization
3. Custom canvas renderer → ✅ **SELECTED**

**Why Custom Canvas?**
- Lightweight (<1KB code)
- Full control over styling
- Reuses existing audio buffers
- Matches app design system
- No external dependencies

**Implementation**:
- Downsample audio to 1000 samples
- Render as vertical bars
- Color: `#667eea` (matches app gradient)
- Canvas size: 800x120px

---

### Decision 6: Saved Configurations Architecture

**Storage**: SQLite database (not localStorage)
**Rationale**: Queryable, searchable, relational

**Schema**:
```sql
CREATE TABLE saved_configs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  settings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

**Features**:
- Save current settings as named preset
- Load preset into current settings
- Edit/rename saved presets
- Delete saved presets
- Export/import as JSON

---

## Implementation Phases

---

## PHASE 1: Foundation & Quick Wins (3-4 hours)

### Feature 1: Random Seed Button ⭐

**Complexity**: Trivial
**Files Modified**: `web/src/App.tsx`

**Implementation**:
```typescript
// In App.tsx, modify the seed input section
<div className="setting">
  <label htmlFor="seed">Random Seed</label>
  <div className="seed-input-group">
    <input
      type="number"
      id="seed"
      value={seed}
      onChange={e => setSeed(Number(e.target.value))}
    />
    <button
      onClick={() => setSeed(Math.floor(Math.random() * 1000000))}
      className="btn-icon"
      title="Generate random seed"
    >
      🎲
    </button>
  </div>
</div>
```

**CSS Addition**:
```css
.seed-input-group {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  padding: 0.5rem 1rem;
  font-size: 1.2rem;
  cursor: pointer;
}
```

**Testing**:
1. Click random button 10 times
2. Verify each seed is unique
3. Generate audio with random seed
4. Verify reproducibility (same seed → same output)

---

### Feature 2: Delete Individual Generations ⭐⭐

**Complexity**: Simple
**Files Modified**:
- `web/src/App.tsx` (UI + handler)
- `web/src/index.ts` (new DELETE route)

**Backend Implementation** (`index.ts`):
```typescript
// Add new route handler
routes["/api/generations/:id"] = {
  DELETE: req => withSession(req, async sessionId => {
    const id = new URL(req.url).pathname.split('/').pop();

    // Fetch generation to get audio path
    const row = db.query(
      "SELECT audio_path FROM generations WHERE id = $id AND session_id = $sessionId"
    ).get({ id, sessionId });

    if (!row) {
      return jsonError("Generation not found", 404);
    }

    // Delete audio file from disk
    try {
      await Bun.file(row.audio_path).delete();
    } catch (err) {
      console.error(`Failed to delete ${row.audio_path}:`, err);
    }

    // Delete from database
    db.query("DELETE FROM generations WHERE id = $id").run({ id });

    return Response.json({ success: true });
  })
};
```

**Frontend Implementation** (`App.tsx`):
```typescript
const handleDelete = async (id: string) => {
  if (!confirm('Delete this generation?')) return;

  try {
    const response = await fetch(`/api/generations/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete');
    }

    // Remove from state
    setGenerations(prev => prev.filter(g => g.id !== id));
  } catch (err) {
    setError(`Delete failed: ${err.message}`);
  }
};

// In generation item render:
<div className="output-item">
  <div className="output-header">
    <span>{gen.created_at}</span>
    <button
      onClick={() => handleDelete(gen.id)}
      className="btn-delete"
      title="Delete generation"
    >
      🗑️
    </button>
  </div>
  {/* ... rest of item */}
</div>
```

**CSS Addition**:
```css
.btn-delete {
  background: transparent;
  color: #ef4444;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
}

.btn-delete:hover {
  color: #dc2626;
  transform: scale(1.1);
}
```

**Testing**:
1. Generate 3 audios
2. Delete middle one
3. Verify file removed from `web/data/audio/`
4. Verify database row deleted
5. Verify UI updates correctly
6. Test delete with invalid ID (should handle gracefully)

---

### Feature 3: Text Character Count + Estimated Time ⭐

**Complexity**: Low
**Files Modified**:
- `web/src/utils/timeEstimator.ts` (new file)
- `web/src/App.tsx` (display)

**Time Estimator Utility** (`utils/timeEstimator.ts`):
```typescript
import type { GenerationSettings } from '../types';

/**
 * Estimates generation time based on text length and settings
 *
 * Empirical measurements:
 * - ~12.5 characters per second of audio
 * - ~80 LLM tokens per second generation speed
 * - ~0.5 seconds per Flow denoising step (10 steps = 5s)
 */
export function estimateGenerationTime(
  text: string,
  settings: GenerationSettings
): number {
  const charCount = text.length;

  // Estimate audio duration
  const charsPerSecond = 12.5; // Average speaking rate
  const audioSeconds = charCount / charsPerSecond;

  // Estimate LLM processing time
  const avgTokenTextRatio = (settings.min_token_text_ratio + settings.max_token_text_ratio) / 2;
  const estimatedTokens = charCount * avgTokenTextRatio;
  const tokensPerSecond = 80; // GPU-dependent, use conservative estimate
  const llmSeconds = estimatedTokens / tokensPerSecond;

  // Flow matching time (relatively constant)
  const flowSeconds = 5; // 10 steps * 0.5s/step

  // Total time (LLM + Flow + overhead)
  return Math.ceil(llmSeconds + flowSeconds + 2);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
```

**Frontend Display** (`App.tsx`):
```typescript
// Add below textarea
<div className="text-stats">
  <span>{inputText.length} characters</span>
  <span>•</span>
  <span>~{formatDuration(estimateGenerationTime(inputText, settings))} estimated</span>
</div>
```

**CSS Addition**:
```css
.text-stats {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}
```

**Testing**:
1. Type 100 characters → verify "~8s estimated"
2. Type 500 characters → verify "~35s estimated"
3. Change settings (max_token_text_ratio) → verify estimate updates
4. Generate audio, compare actual vs estimated time
5. Test edge cases (empty text, very long text)

---

### Feature 4: Auto-scroll to Output ⭐

**Complexity**: Trivial
**Files Modified**: `web/src/App.tsx`

**Implementation**:
```typescript
// Add ref at top of component
const outputPanelRef = useRef<HTMLDivElement>(null);

// Add effect to scroll after new generation
useEffect(() => {
  if (generations.length > 0) {
    setTimeout(() => {
      outputPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100); // Small delay to ensure render complete
  }
}, [generations.length]);

// Add ref to output panel
<div className="panel output-panel" ref={outputPanelRef}>
  <h2>Generated Audio</h2>
  {/* ... */}
</div>
```

**Testing**:
1. Scroll to top of page
2. Generate audio
3. Verify smooth scroll to output section
4. Test on mobile viewport
5. Test with settings panel open (should still scroll)

---

### PHASE 1 Deliverables Checklist
- [ ] Random seed button working
- [ ] Individual deletion with file cleanup verified
- [ ] Character count + time estimation accurate
- [ ] Auto-scroll smooth on all viewports
- [ ] All features tested independently
- [ ] No regressions in existing functionality

---

## PHASE 2: Storage Management (3-4 hours)

### Feature 5: Persist Reference Audio (IndexedDB) ⭐⭐⭐

**Complexity**: Medium
**Files Modified**:
- `web/src/hooks/useIndexedDB.ts` (new file)
- `web/src/App.tsx` (integration)

**IndexedDB Hook** (`hooks/useIndexedDB.ts`):
```typescript
import { useState, useEffect } from 'react';

const DB_NAME = 'glmtts';
const DB_VERSION = 1;
const STORE_NAME = 'referenceAudio';

export interface ReferenceAudioEntry {
  id: string;
  name: string;
  audioBlob: Blob;
  transcript: string;
  createdAt: number;
  duration?: number;
  waveform?: number[];
}

export function useReferenceAudioDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB failed to open');
    };

    request.onsuccess = () => {
      setDb(request.result);
      setReady(true);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    return () => {
      db?.close();
    };
  }, []);

  const saveAudio = async (entry: ReferenceAudioEntry): Promise<void> => {
    if (!db) throw new Error('Database not ready');

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  const loadAudio = async (id: string): Promise<ReferenceAudioEntry | null> => {
    if (!db) throw new Error('Database not ready');

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  };

  const listAudio = async (): Promise<ReferenceAudioEntry[]> => {
    if (!db) throw new Error('Database not ready');

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const deleteAudio = async (id: string): Promise<void> => {
    if (!db) throw new Error('Database not ready');

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  return { saveAudio, loadAudio, listAudio, deleteAudio, ready };
}
```

**Integration in App.tsx**:
```typescript
const { saveAudio, listAudio, ready: dbReady } = useReferenceAudioDB();
const [showSavePrompt, setShowSavePrompt] = useState(false);

const handleSaveReference = async () => {
  if (!referenceAudio || !dbReady) return;

  const name = prompt('Name for this reference audio:');
  if (!name) return;

  try {
    await saveAudio({
      id: crypto.randomUUID(),
      name,
      audioBlob: referenceAudio,
      transcript: referenceText,
      createdAt: Date.now(),
    });

    alert('Reference audio saved!');
  } catch (err) {
    setError(`Failed to save: ${err.message}`);
  }
};

// Add button in reference audio section
{referenceAudio && dbReady && (
  <button onClick={handleSaveReference} className="btn-secondary">
    💾 Save to Library
  </button>
)}
```

**Testing**:
1. Upload reference audio
2. Click "Save to Library"
3. Enter name
4. Close browser completely
5. Reopen, verify audio still available
6. Test quota exceeded scenario (upload 100MB file)
7. Test with multiple audio files (10+)

---

### Feature 6: Bulk Delete/Cleanup + Storage Display ⭐⭐⭐

**Complexity**: Medium
**Files Modified**:
- `web/src/components/StorageManager.tsx` (new file)
- `web/src/index.ts` (new routes)
- `web/src/App.tsx` (integration)

**Backend Routes** (`index.ts`):
```typescript
// Storage info endpoint
routes["/api/storage/info"] = {
  GET: req => withSession(req, async sessionId => {
    const rows = db.query(
      "SELECT audio_path FROM generations WHERE session_id = $sessionId"
    ).all({ sessionId });

    let totalBytes = 0;
    let fileCount = 0;

    for (const row of rows) {
      const file = Bun.file(row.audio_path);
      if (await file.exists()) {
        totalBytes += file.size;
        fileCount++;
      }
    }

    // Get database size
    const dbFile = Bun.file(DB_PATH);
    const dbBytes = (await dbFile.exists()) ? dbFile.size : 0;

    return Response.json({ totalBytes, fileCount, dbBytes });
  })
};

// Bulk cleanup endpoint
routes["/api/storage/cleanup"] = {
  POST: req => withSession(req, async sessionId => {
    const { olderThanDays } = await req.json();
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    const rows = db.query(
      "SELECT id, audio_path FROM generations WHERE session_id = $sessionId AND created_at < $cutoff"
    ).all({ sessionId, cutoff: cutoffTime });

    let deleted = 0;
    let bytesFreed = 0;

    for (const row of rows) {
      try {
        const file = Bun.file(row.audio_path);
        const size = await file.exists() ? file.size : 0;

        await file.delete();
        db.query("DELETE FROM generations WHERE id = $id").run({ id: row.id });

        deleted++;
        bytesFreed += size;
      } catch (err) {
        console.error(`Failed to delete ${row.id}:`, err);
      }
    }

    return Response.json({ deleted, bytesFreed });
  })
};
```

**Storage Manager Component** (`components/StorageManager.tsx`):
```typescript
import { useState, useEffect } from 'react';

interface StorageInfo {
  totalBytes: number;
  fileCount: number;
  dbBytes: number;
}

export function StorageManager({ onCleanup }: { onCleanup: () => void }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const loadInfo = async () => {
    const response = await fetch('/api/storage/info');
    const data = await response.json();
    setInfo(data);
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const handleCleanup = async (days: number) => {
    const confirmed = confirm(
      `Delete all generations older than ${days} days?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch('/api/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ olderThanDays: days })
      });

      const { deleted, bytesFreed } = await response.json();
      alert(`Deleted ${deleted} generations (${formatBytes(bytesFreed)} freed)`);

      await loadInfo();
      onCleanup();
    } catch (err) {
      alert(`Cleanup failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!info) return <div>Loading storage info...</div>;

  return (
    <div className="storage-manager">
      <h3>Storage Usage</h3>

      <div className="storage-stats">
        <div className="stat">
          <span className="stat-label">Audio Files</span>
          <span className="stat-value">{info.fileCount} files ({formatBytes(info.totalBytes)})</span>
        </div>
        <div className="stat">
          <span className="stat-label">Database</span>
          <span className="stat-value">{formatBytes(info.dbBytes)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total</span>
          <span className="stat-value">{formatBytes(info.totalBytes + info.dbBytes)}</span>
        </div>
      </div>

      <div className="cleanup-actions">
        <button
          onClick={() => handleCleanup(7)}
          disabled={loading}
          className="btn-warning"
        >
          Delete older than 7 days
        </button>
        <button
          onClick={() => handleCleanup(30)}
          disabled={loading}
          className="btn-warning"
        >
          Delete older than 30 days
        </button>
        <button
          onClick={() => handleCleanup(0)}
          disabled={loading}
          className="btn-danger"
        >
          Delete all
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
```

**CSS Addition** (`index.css`):
```css
.storage-manager {
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.storage-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin: 1rem 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
}

.cleanup-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.btn-warning:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
}
```

**Integration in App.tsx**:
```typescript
import { StorageManager } from './components/StorageManager';

// Add to settings panel or main view
<StorageManager onCleanup={() => loadGenerations()} />
```

**Testing**:
1. Generate 10 audios with different timestamps
2. Verify storage stats display correctly
3. Test "Delete older than 7 days"
4. Verify files removed from disk
5. Verify database updated
6. Test "Delete all" with confirmation
7. Verify storage stats refresh after cleanup

---

### PHASE 2 Deliverables Checklist
- [ ] IndexedDB integration working
- [ ] Reference audio persists across sessions
- [ ] Storage manager displays accurate stats
- [ ] Bulk delete works with all time ranges
- [ ] File system cleanup verified
- [ ] Memory leaks tested (browser DevTools)

---

## PHASE 3: UX Improvements (2-3 hours)

### Feature 7: Drag-and-Drop Audio ⭐⭐

**Complexity**: Simple
**Files Modified**: `web/src/App.tsx`

**Implementation**:
```typescript
const [isDragging, setIsDragging] = useState(false);

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(true);
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith('audio/')) {
    setError('Please drop an audio file');
    return;
  }

  handleFileUpload(file);
};

const handleFileUpload = (file: File) => {
  setReferenceAudio(file);

  const nextUrl = URL.createObjectURL(file);
  if (referenceAudioUrl) {
    URL.revokeObjectURL(referenceAudioUrl);
  }
  setReferenceAudioUrl(nextUrl);
};

// Update file input section
<div
  className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  <input
    type="file"
    accept="audio/*"
    onChange={e => e.target.files && handleFileUpload(e.target.files[0])}
    id="ref-audio"
    className="file-input"
  />
  <label htmlFor="ref-audio" className="file-label">
    {referenceAudio ? (
      <span>✓ {referenceAudio.name}</span>
    ) : (
      <span>📁 Drag audio file here or click to browse</span>
    )}
  </label>
</div>
```

**CSS Addition**:
```css
.file-drop-zone {
  border: 2px dashed rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
}

.file-drop-zone.dragging {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.15);
  transform: scale(1.02);
}

.file-input {
  display: none;
}

.file-label {
  display: block;
  cursor: pointer;
  color: #9ca3af;
}

.file-label:hover {
  color: #667eea;
}
```

**Testing**:
1. Drag MP3 file → verify upload
2. Drag WAV file → verify upload
3. Drag non-audio file → verify error message
4. Drag multiple files → verify only first is used
5. Test on mobile (should still allow click to browse)

---

### Feature 8: Export Settings with Audio (JSON Sidecar) ⭐⭐

**Complexity**: Medium
**Files Modified**:
- `web/src/hooks/useAudioExport.ts` (new file)
- `web/src/components/GenerationItem.tsx` (new file)
- `web/src/App.tsx` (refactor to use GenerationItem)

**Dependencies**: Install jszip
```bash
bun add jszip
```

**Export Hook** (`hooks/useAudioExport.ts`):
```typescript
import JSZip from 'jszip';
import type { Generation } from '../types';

export function useAudioExport() {
  const exportWithMetadata = async (generation: Generation) => {
    try {
      // Fetch audio blob
      const audioResponse = await fetch(generation.audio_url);
      const audioBlob = await audioResponse.blob();

      // Create metadata object
      const metadata = {
        glmtts_version: "1.0",
        export_date: new Date().toISOString(),
        generation: {
          id: generation.id,
          input_text: generation.input_text,
          reference_text: generation.reference_text,
          seed: generation.seed,
          created_at: generation.created_at,
          settings: generation.settings,
        }
      };

      // Create zip file
      const zip = new JSZip();
      zip.file(generation.output_filename, audioBlob);
      zip.file(`${generation.id}_metadata.json`, JSON.stringify(metadata, null, 2));

      // Generate and download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `glmtts_${generation.id}.zip`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      throw new Error(`Export failed: ${err.message}`);
    }
  };

  return { exportWithMetadata };
}
```

**Generation Item Component** (`components/GenerationItem.tsx`):
```typescript
import { useState } from 'react';
import { useAudioExport } from '../hooks/useAudioExport';
import type { Generation } from '../types';

interface Props {
  generation: Generation;
  onDelete: (id: string) => void;
}

export function GenerationItem({ generation, onDelete }: Props) {
  const { exportWithMetadata } = useAudioExport();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportWithMetadata(generation);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="output-item">
      <div className="output-header">
        <span className="output-date">
          {new Date(generation.created_at).toLocaleString()}
        </span>
        <div className="output-actions">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-icon"
            title="Export with metadata"
          >
            {exporting ? '⏳' : '📦'}
          </button>
          <button
            onClick={() => onDelete(generation.id)}
            className="btn-icon btn-delete"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="output-body">
        <div className="output-text">
          <strong>Input:</strong> {generation.input_text}
        </div>
        {generation.reference_text && (
          <div className="output-text">
            <strong>Reference:</strong> {generation.reference_text}
          </div>
        )}
        <div className="output-meta">
          Seed: {generation.seed} | Preset: {generation.settings.preset}
        </div>
      </div>

      <audio controls src={generation.audio_url} className="output-audio" />

      <div className="output-footer">
        <a
          href={generation.audio_url}
          download={generation.output_filename}
          className="btn-download"
        >
          ⬇️ Download WAV
        </a>
      </div>
    </div>
  );
}
```

**Testing**:
1. Generate audio
2. Click export button
3. Extract zip file
4. Verify audio file intact
5. Verify metadata.json contains all settings
6. Test with 5 different presets
7. Verify metadata accurately reflects each preset

---

### PHASE 3 Deliverables Checklist
- [ ] Drag-and-drop working for all audio formats
- [ ] Export creates valid zip files
- [ ] Metadata JSON includes all generation parameters
- [ ] GenerationItem component extracted and reusable
- [ ] Visual feedback during drag and export operations

---

## PHASE 4: Preset Improvements (1-2 hours)

### Feature 9: Preset Tooltips ⭐

**Complexity**: Trivial
**Files Modified**:
- `web/src/utils/presetDescriptions.ts` (new file)
- `web/src/App.tsx` (tooltip integration)

**Preset Descriptions** (`utils/presetDescriptions.ts`):
```typescript
export const PRESET_DESCRIPTIONS = {
  balanced: {
    title: "Balanced (Default)",
    description: "General-purpose settings with good quality and speed balance. Best for most use cases.",
    useCases: ["Narration", "General speech", "Everyday use"]
  },
  expressive: {
    title: "Expressive",
    description: "Higher diversity for more emotional range and variation. May reduce consistency slightly.",
    useCases: ["Character voices", "Storytelling", "Emotional content"]
  },
  sensual: {
    title: "Sensual",
    description: "Optimized for intimate, breathy voice characteristics with soft tones.",
    useCases: ["ASMR", "Romantic content", "Meditation guides"]
  },
  asmr: {
    title: "ASMR",
    description: "High temperature + phoneme control for soft, whispered speech with precise articulation.",
    useCases: ["ASMR videos", "Whispered narration", "Relaxation content"]
  },
  stable: {
    title: "Stable",
    description: "Conservative sampling for highly consistent output with minimal variation.",
    useCases: ["Professional narration", "Formal content", "Documentation"]
  },
  ultra_stable: {
    title: "Ultra Stable",
    description: "Maximum stability with minimal randomness. Best for formal, consistent content.",
    useCases: ["Corporate videos", "Technical documentation", "Official announcements"]
  },
  longform: {
    title: "Long-form",
    description: "Extended length ratio for longer continuity without cutoff. Ideal for extended passages.",
    useCases: ["Audiobooks", "Long articles", "Extended narration"]
  },
  fast: {
    title: "Fast Generation",
    description: "Reduced token ratios for quick, short-form generation. Optimized for speed over duration.",
    useCases: ["Short phrases", "Quick tests", "Rapid iteration"]
  },
  creative: {
    title: "Creative",
    description: "High variation mode for experimental, diverse outputs. Expect unpredictable results.",
    useCases: ["Experimental content", "Varied character voices", "Creative exploration"]
  },
  low_repetition: {
    title: "Low Repetition",
    description: "Reduced top_p to minimize repeated phrases and improve variety in long generations.",
    useCases: ["Long-form content", "Avoiding loops", "Diverse narration"]
  },
  pronunciation: {
    title: "Pronunciation Control",
    description: "Enables phoneme-level control for accurate pronunciation of polyphones and rare characters.",
    useCases: ["Foreign words", "Technical terms", "Proper nouns"]
  },
  custom: {
    title: "Custom Settings",
    description: "Manually configured settings. Adjust parameters to your specific needs.",
    useCases: ["Advanced users", "Specific requirements", "Fine-tuning"]
  }
} as const;

export type PresetKey = keyof typeof PRESET_DESCRIPTIONS;
```

**Tooltip Component** (`components/PresetTooltip.tsx`):
```typescript
import { PRESET_DESCRIPTIONS, type PresetKey } from '../utils/presetDescriptions';

interface Props {
  preset: PresetKey;
}

export function PresetTooltip({ preset }: Props) {
  const info = PRESET_DESCRIPTIONS[preset];

  return (
    <div className="preset-tooltip">
      <div className="tooltip-title">{info.title}</div>
      <div className="tooltip-description">{info.description}</div>
      <div className="tooltip-use-cases">
        <strong>Best for:</strong>
        <ul>
          {info.useCases.map((useCase, i) => (
            <li key={i}>{useCase}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Integration in Settings Panel**:
```typescript
<div className="setting">
  <label htmlFor="preset">
    Preset
    <span className="info-icon" title="Hover for details">ℹ️</span>
  </label>
  <select
    id="preset"
    value={settings.preset}
    onChange={handlePresetChange}
  >
    {Object.entries(PRESET_DESCRIPTIONS).map(([key, info]) => (
      <option key={key} value={key} title={info.description}>
        {info.title}
      </option>
    ))}
  </select>
</div>
```

**CSS Addition**:
```css
.preset-tooltip {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 1rem;
  max-width: 300px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #667eea;
}

.tooltip-description {
  font-size: 0.875rem;
  color: #d1d5db;
  margin-bottom: 0.75rem;
}

.tooltip-use-cases {
  font-size: 0.875rem;
}

.tooltip-use-cases ul {
  margin: 0.25rem 0 0 1.25rem;
  padding: 0;
}

.tooltip-use-cases li {
  margin: 0.125rem 0;
  color: #9ca3af;
}

.info-icon {
  margin-left: 0.5rem;
  cursor: help;
  opacity: 0.6;
}
```

**Testing**:
1. Hover over each preset option
2. Verify tooltip appears
3. Verify descriptions are accurate
4. Test on mobile (touch should show tooltip)
5. Verify tooltips don't overflow viewport

---

### PHASE 4 Deliverables Checklist
- [ ] All 12 presets have tooltips
- [ ] Descriptions are clear and helpful
- [ ] Use cases are appropriate
- [ ] Tooltips work on desktop and mobile
- [ ] No layout issues or overflow

---

## PHASE 5: Batch Operations (3-4 hours)

### Feature 10: Generation Queue ⭐⭐⭐⭐

**Complexity**: High
**Files Modified**:
- `web/src/hooks/useQueue.ts` (new file)
- `web/src/components/GenerationQueue.tsx` (new file)
- `web/src/App.tsx` (integration)

**Queue Hook** (`hooks/useQueue.ts`):
```typescript
import { useState } from 'react';
import type { GenerationSettings } from '../types';

export interface QueueItem {
  id: string;
  text: string;
  referenceAudioId: string;
  referenceTranscript: string;
  settings: GenerationSettings;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  resultId?: string;
  addedAt: number;
  completedAt?: number;
}

export function useQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);

  const addToQueue = (item: Omit<QueueItem, 'id' | 'status' | 'addedAt'>) => {
    const newItem: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      status: 'pending',
      addedAt: Date.now()
    };

    setQueue(prev => [...prev, newItem]);
    return newItem.id;
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== 'completed'));
  };

  const clearAll = () => {
    if (isProcessing) {
      if (!confirm('Queue is processing. Stop and clear all?')) return;
    }
    setQueue([]);
    setIsProcessing(false);
    setCurrentItem(null);
  };

  const processQueue = async (
    synthesizeFn: (item: QueueItem) => Promise<{ id: string }>
  ) => {
    if (isProcessing) return;

    setIsProcessing(true);
    const pendingItems = queue.filter(item => item.status === 'pending');

    for (const item of pendingItems) {
      setCurrentItem(item);
      setQueue(prev => prev.map(i =>
        i.id === item.id ? { ...i, status: 'processing' as const } : i
      ));

      try {
        const result = await synthesizeFn(item);

        setQueue(prev => prev.map(i =>
          i.id === item.id
            ? { ...i, status: 'completed' as const, resultId: result.id, completedAt: Date.now() }
            : i
        ));
      } catch (error) {
        setQueue(prev => prev.map(i =>
          i.id === item.id
            ? { ...i, status: 'failed' as const, error: error.message, completedAt: Date.now() }
            : i
        ));
      }

      // Delay between items to avoid overwhelming server
      if (pendingItems.indexOf(item) < pendingItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsProcessing(false);
    setCurrentItem(null);
  };

  const retryFailed = () => {
    setQueue(prev => prev.map(item =>
      item.status === 'failed' ? { ...item, status: 'pending', error: undefined } : item
    ));
  };

  return {
    queue,
    isProcessing,
    currentItem,
    addToQueue,
    removeFromQueue,
    clearCompleted,
    clearAll,
    processQueue,
    retryFailed
  };
}
```

**Queue Component** (`components/GenerationQueue.tsx`):
```typescript
import type { QueueItem } from '../hooks/useQueue';

interface Props {
  queue: QueueItem[];
  isProcessing: boolean;
  currentItem: QueueItem | null;
  onRemove: (id: string) => void;
  onProcess: () => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  onRetryFailed: () => void;
}

export function GenerationQueue({
  queue,
  isProcessing,
  currentItem,
  onRemove,
  onProcess,
  onClearCompleted,
  onClearAll,
  onRetryFailed
}: Props) {
  const pending = queue.filter(i => i.status === 'pending').length;
  const completed = queue.filter(i => i.status === 'completed').length;
  const failed = queue.filter(i => i.status === 'failed').length;

  return (
    <div className="generation-queue">
      <div className="queue-header">
        <h3>Generation Queue</h3>
        <div className="queue-stats">
          <span className="stat-badge pending">{pending} pending</span>
          <span className="stat-badge completed">{completed} completed</span>
          {failed > 0 && <span className="stat-badge failed">{failed} failed</span>}
        </div>
      </div>

      <div className="queue-actions">
        <button
          onClick={onProcess}
          disabled={isProcessing || pending === 0}
          className="btn-primary"
        >
          {isProcessing ? `Processing... (${currentItem?.text.slice(0, 20)}...)` : `Start Queue (${pending})`}
        </button>
        {failed > 0 && (
          <button onClick={onRetryFailed} className="btn-secondary">
            Retry Failed ({failed})
          </button>
        )}
        {completed > 0 && (
          <button onClick={onClearCompleted} className="btn-secondary">
            Clear Completed
          </button>
        )}
        {queue.length > 0 && (
          <button onClick={onClearAll} className="btn-danger">
            Clear All
          </button>
        )}
      </div>

      <div className="queue-items">
        {queue.length === 0 ? (
          <div className="queue-empty">
            No items in queue. Click "Add to Queue" to batch generate.
          </div>
        ) : (
          queue.map(item => (
            <div
              key={item.id}
              className={`queue-item queue-item-${item.status}`}
            >
              <div className="queue-item-header">
                <span className="queue-status-icon">
                  {item.status === 'pending' && '⏸️'}
                  {item.status === 'processing' && '⚙️'}
                  {item.status === 'completed' && '✅'}
                  {item.status === 'failed' && '❌'}
                </span>
                <span className="queue-status-text">{item.status}</span>
              </div>

              <div className="queue-item-body">
                <div className="queue-text">{item.text}</div>
                <div className="queue-meta">
                  Preset: {item.settings.preset} | Seed: {item.settings.seed || 'random'}
                </div>
                {item.error && (
                  <div className="queue-error">Error: {item.error}</div>
                )}
              </div>

              <div className="queue-item-actions">
                {item.status === 'pending' && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="btn-icon btn-delete"
                  >
                    🗑️
                  </button>
                )}
                {item.status === 'completed' && item.resultId && (
                  <a
                    href={`/api/generations/${item.resultId}/audio`}
                    download
                    className="btn-icon"
                  >
                    ⬇️
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**CSS Addition** (`index.css`):
```css
.generation-queue {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.queue-stats {
  display: flex;
  gap: 0.5rem;
}

.stat-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
}

.stat-badge.pending {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.stat-badge.completed {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.stat-badge.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.queue-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.queue-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.queue-empty {
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
}

.queue-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  padding: 1rem;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: center;
  transition: background 0.2s;
}

.queue-item-pending {
  border-left: 3px solid #60a5fa;
}

.queue-item-processing {
  border-left: 3px solid #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  animation: pulse 2s ease-in-out infinite;
}

.queue-item-completed {
  border-left: 3px solid #4ade80;
  opacity: 0.7;
}

.queue-item-failed {
  border-left: 3px solid #f87171;
  background: rgba(248, 113, 113, 0.1);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.queue-item-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.queue-status-icon {
  font-size: 1.5rem;
}

.queue-status-text {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #9ca3af;
}

.queue-item-body {
  flex: 1;
}

.queue-text {
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-meta {
  font-size: 0.8rem;
  color: #9ca3af;
}

.queue-error {
  font-size: 0.8rem;
  color: #f87171;
  margin-top: 0.25rem;
}

.queue-item-actions {
  display: flex;
  gap: 0.5rem;
}
```

**Integration in App.tsx**:
```typescript
import { useQueue } from './hooks/useQueue';
import { GenerationQueue } from './components/GenerationQueue';

// Inside component
const {
  queue,
  isProcessing,
  currentItem,
  addToQueue,
  removeFromQueue,
  clearCompleted,
  clearAll,
  processQueue,
  retryFailed
} = useQueue();

const handleAddToQueue = () => {
  if (!inputText.trim() || !referenceAudio) {
    setError('Please provide text and reference audio');
    return;
  }

  addToQueue({
    text: inputText,
    referenceAudioId: referenceAudio.name, // TODO: Use actual ID from library
    referenceTranscript: referenceText,
    settings
  });

  // Optionally clear input
  setInputText('');
};

const handleProcessQueue = async () => {
  await processQueue(async (item) => {
    // Reuse existing synthesize logic
    const formData = new FormData();
    formData.append('text', item.text);
    formData.append('speaker_audio', referenceAudio); // TODO: Load from library
    formData.append('speaker_text', item.referenceTranscript);

    // Add all settings
    Object.entries(item.settings).forEach(([key, value]) => {
      if (key !== 'preset') {
        formData.append(key, String(value));
      }
    });

    const response = await fetch('/api/synthesize', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Generation failed');
    }

    const result = await response.json();
    return { id: result.id };
  });
};

// In JSX
<GenerationQueue
  queue={queue}
  isProcessing={isProcessing}
  currentItem={currentItem}
  onRemove={removeFromQueue}
  onProcess={handleProcessQueue}
  onClearCompleted={clearCompleted}
  onClearAll={clearAll}
  onRetryFailed={retryFailed}
/>

{/* Add to Queue button */}
<button
  onClick={handleAddToQueue}
  className="btn-secondary"
  disabled={!inputText.trim() || !referenceAudio}
>
  ➕ Add to Queue
</button>
```

**Testing**:
1. Add 5 items to queue with different texts
2. Start queue processing
3. Verify sequential execution
4. Test removing pending item
5. Test retry failed items
6. Test clear completed
7. Test clear all during processing
8. Verify 1-second delay between items
9. Test error handling (disconnect backend mid-queue)
10. Verify queue state persists (optional: localStorage)

---

### PHASE 5 Deliverables Checklist
- [ ] Queue UI fully functional
- [ ] Sequential processing working
- [ ] Error handling robust
- [ ] Retry mechanism working
- [ ] Clear operations safe
- [ ] Visual feedback clear (animations, badges)
- [ ] No memory leaks during long queues

---

## PHASE 6: Advanced Features (4-5 hours)

### Feature 11: Waveform Visualization ⭐⭐⭐

**Complexity**: Medium-High
**Files Modified**:
- `web/src/components/WaveformVisualizer.tsx` (new file)
- `web/src/components/GenerationItem.tsx` (integration)

**Waveform Component** (`components/WaveformVisualizer.tsx`):
```typescript
import { useEffect, useRef, useState } from 'react';

interface Props {
  audioUrl: string;
  width?: number;
  height?: number;
  barColor?: string;
}

export function WaveformVisualizer({
  audioUrl,
  width = 800,
  height = 120,
  barColor = '#667eea'
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWaveform = async () => {
      setLoading(true);
      setError(null);

      try {
        const audioContext = new AudioContext();

        // Fetch and decode audio
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Extract channel data
        const rawData = audioBuffer.getChannelData(0); // Mono or left channel

        // Downsample to 1000 samples for performance
        const samples = 1000;
        const blockSize = Math.floor(rawData.length / samples);
        const filtered: number[] = [];

        for (let i = 0; i < samples; i++) {
          let blockSum = 0;
          for (let j = 0; j < blockSize; j++) {
            blockSum += Math.abs(rawData[i * blockSize + j]);
          }
          filtered.push(blockSum / blockSize);
        }

        setWaveformData(filtered);
      } catch (err) {
        setError('Failed to load waveform');
        console.error('Waveform error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadWaveform();
  }, [audioUrl]);

  useEffect(() => {
    if (!waveformData.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate dimensions
    const barWidth = width / waveformData.length;
    const maxAmplitude = Math.max(...waveformData);

    // Draw waveform
    ctx.fillStyle = barColor;

    waveformData.forEach((value, i) => {
      const barHeight = (value / maxAmplitude) * height * 0.9; // 90% of height
      const x = i * barWidth;
      const y = (height - barHeight) / 2; // Center vertically

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
  }, [waveformData, width, height, barColor]);

  if (loading) {
    return (
      <div className="waveform-loading" style={{ width, height }}>
        Loading waveform...
      </div>
    );
  }

  if (error) {
    return (
      <div className="waveform-error" style={{ width, height }}>
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="waveform-canvas"
    />
  );
}
```

**CSS Addition** (`index.css`):
```css
.waveform-canvas {
  width: 100%;
  height: auto;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
}

.waveform-loading,
.waveform-error {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  color: #9ca3af;
  font-size: 0.875rem;
}

.waveform-error {
  color: #f87171;
}
```

**Integration in GenerationItem**:
```typescript
import { WaveformVisualizer } from './WaveformVisualizer';

// In component
<div className="output-waveform">
  <WaveformVisualizer audioUrl={generation.audio_url} />
</div>
```

**Testing**:
1. Generate audio with speech
2. Verify waveform renders
3. Generate silence → verify flat waveform
4. Generate loud audio → verify peaks
5. Test on mobile (canvas should be responsive)
6. Verify memory cleanup (multiple waveforms)
7. Test audio with mono/stereo channels

---

### Feature 12: Reference Audio Library ⭐⭐⭐⭐⭐

**Complexity**: Very High
**Files Modified**:
- `web/src/components/ReferenceAudioLibrary.tsx` (complete version)
- `web/src/App.tsx` (integration)
- `web/src/hooks/useIndexedDB.ts` (extend)

**Complete Library Component** (`components/ReferenceAudioLibrary.tsx`):
```typescript
import { useState, useEffect } from 'react';
import { useReferenceAudioDB, type ReferenceAudioEntry } from '../hooks/useIndexedDB';

interface Props {
  onSelect: (entry: ReferenceAudioEntry) => void;
  onClose: () => void;
}

export function ReferenceAudioLibrary({ onSelect, onClose }: Props) {
  const [library, setLibrary] = useState<ReferenceAudioEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');
  const { listAudio, deleteAudio, ready } = useReferenceAudioDB();

  useEffect(() => {
    if (ready) {
      loadLibrary();
    }
  }, [ready]);

  const loadLibrary = async () => {
    const items = await listAudio();
    setLibrary(items);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this reference audio?')) return;

    await deleteAudio(id);
    setLibrary(prev => prev.filter(e => e.id !== id));
  };

  const handleSelect = (entry: ReferenceAudioEntry) => {
    onSelect(entry);
    onClose();
  };

  const filteredLibrary = library
    .filter(entry =>
      entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.transcript.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return b.createdAt - a.createdAt;
    });

  return (
    <div className="reference-library-modal">
      <div className="modal-overlay" onClick={onClose} />

      <div className="modal-content">
        <div className="modal-header">
          <h2>Reference Audio Library</h2>
          <button onClick={onClose} className="btn-close">✕</button>
        </div>

        <div className="library-controls">
          <input
            type="text"
            placeholder="Search by name or transcript..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'name' | 'date')}
            className="sort-select"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        <div className="library-grid">
          {filteredLibrary.length === 0 ? (
            <div className="library-empty">
              {searchQuery ? 'No matching audio found' : 'No saved reference audio yet'}
            </div>
          ) : (
            filteredLibrary.map(entry => (
              <div key={entry.id} className="library-card">
                <div className="library-card-header">
                  <h3>{entry.name}</h3>
                  <span className="library-date">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="library-card-body">
                  {entry.transcript && (
                    <p className="library-transcript">"{entry.transcript}"</p>
                  )}
                  {entry.duration && (
                    <span className="library-duration">{entry.duration.toFixed(1)}s</span>
                  )}
                </div>

                <audio
                  controls
                  src={URL.createObjectURL(entry.audioBlob)}
                  className="library-audio"
                />

                <div className="library-card-actions">
                  <button
                    onClick={() => handleSelect(entry)}
                    className="btn-primary"
                  >
                    Use This
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="btn-delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

**CSS Addition** (`index.css`):
```css
.reference-library-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal-content {
  position: relative;
  background: #1f2937;
  border-radius: 12px;
  padding: 2rem;
  max-width: 900px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  z-index: 1001;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #9ca3af;
}

.btn-close:hover {
  color: #fff;
}

.library-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.search-input {
  flex: 1;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
}

.sort-select {
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.library-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.library-card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.library-card-header h3 {
  font-size: 1rem;
  margin: 0;
  color: #667eea;
}

.library-date {
  font-size: 0.75rem;
  color: #9ca3af;
}

.library-transcript {
  font-size: 0.875rem;
  color: #d1d5db;
  font-style: italic;
  margin: 0;
}

.library-duration {
  font-size: 0.75rem;
  color: #9ca3af;
}

.library-audio {
  width: 100%;
}

.library-card-actions {
  display: flex;
  gap: 0.5rem;
}

.library-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem;
  color: #9ca3af;
}
```

**Testing**:
1. Save 10 reference audios
2. Test search by name
3. Test search by transcript
4. Test sort by date/name
5. Select audio → verify it loads into main UI
6. Delete audio → verify removal
7. Test with 50+ audios (performance)
8. Verify audio blob URLs don't leak memory

---

### Feature 13: Audio Format Options (MP3/FLAC) ⭐⭐⭐⭐

**Complexity**: High
**Dependencies**: Install ffmpeg.wasm
```bash
bun add @ffmpeg/ffmpeg @ffmpeg/util
```

**Files Modified**:
- `web/src/hooks/useAudioConverter.ts` (new file)
- `web/src/components/GenerationItem.tsx` (extend)

**Audio Converter Hook** (`hooks/useAudioConverter.ts`):
```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useState, useEffect } from 'react';

export function useAudioConverter() {
  const [ffmpeg] = useState(() => new FFmpeg());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    if (loaded) return;

    setLoading(true);
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setLoaded(true);
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
    } finally {
      setLoading(false);
    }
  };

  const convertToMP3 = async (audioUrl: string): Promise<Blob> => {
    if (!loaded) throw new Error('FFmpeg not loaded');

    // Fetch input file
    await ffmpeg.writeFile('input.wav', await fetchFile(audioUrl));

    // Convert to MP3 (VBR quality 2, ~190 kbps)
    await ffmpeg.exec([
      '-i', 'input.wav',
      '-codec:a', 'libmp3lame',
      '-qscale:a', '2',
      'output.mp3'
    ]);

    // Read output
    const data = await ffmpeg.readFile('output.mp3');

    // Cleanup
    await ffmpeg.deleteFile('input.wav');
    await ffmpeg.deleteFile('output.mp3');

    return new Blob([data], { type: 'audio/mpeg' });
  };

  const convertToFLAC = async (audioUrl: string): Promise<Blob> => {
    if (!loaded) throw new Error('FFmpeg not loaded');

    await ffmpeg.writeFile('input.wav', await fetchFile(audioUrl));

    // Convert to FLAC (lossless)
    await ffmpeg.exec([
      '-i', 'input.wav',
      '-codec:a', 'flac',
      '-compression_level', '8',
      'output.flac'
    ]);

    const data = await ffmpeg.readFile('output.flac');

    await ffmpeg.deleteFile('input.wav');
    await ffmpeg.deleteFile('output.flac');

    return new Blob([data], { type: 'audio/flac' });
  };

  const convertToOGG = async (audioUrl: string): Promise<Blob> => {
    if (!loaded) throw new Error('FFmpeg not loaded');

    await ffmpeg.writeFile('input.wav', await fetchFile(audioUrl));

    // Convert to OGG Vorbis (quality 6, ~192 kbps)
    await ffmpeg.exec([
      '-i', 'input.wav',
      '-codec:a', 'libvorbis',
      '-qscale:a', '6',
      'output.ogg'
    ]);

    const data = await ffmpeg.readFile('output.ogg');

    await ffmpeg.deleteFile('input.wav');
    await ffmpeg.deleteFile('output.ogg');

    return new Blob([data], { type: 'audio/ogg' });
  };

  return {
    convertToMP3,
    convertToFLAC,
    convertToOGG,
    loaded,
    loading
  };
}
```

**Extended Generation Item** (`components/GenerationItem.tsx`):
```typescript
import { useState } from 'react';
import { useAudioConverter } from '../hooks/useAudioConverter';

// Add format state
const [selectedFormat, setSelectedFormat] = useState<'wav' | 'mp3' | 'flac' | 'ogg'>('wav');
const [converting, setConverting] = useState(false);
const { convertToMP3, convertToFLAC, convertToOGG, loaded } = useAudioConverter();

const handleDownload = async () => {
  if (selectedFormat === 'wav') {
    // Direct download
    const a = document.createElement('a');
    a.href = generation.audio_url;
    a.download = generation.output_filename;
    a.click();
    return;
  }

  setConverting(true);
  try {
    let blob: Blob;
    let extension: string;

    switch (selectedFormat) {
      case 'mp3':
        blob = await convertToMP3(generation.audio_url);
        extension = 'mp3';
        break;
      case 'flac':
        blob = await convertToFLAC(generation.audio_url);
        extension = 'flac';
        break;
      case 'ogg':
        blob = await convertToOGG(generation.audio_url);
        extension = 'ogg';
        break;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generation.output_filename.replace('.wav', `.${extension}`);
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Conversion failed: ${err.message}`);
  } finally {
    setConverting(false);
  }
};

// In JSX
<div className="output-download">
  <select
    value={selectedFormat}
    onChange={e => setSelectedFormat(e.target.value as any)}
    disabled={converting}
  >
    <option value="wav">WAV (Original)</option>
    <option value="mp3">MP3 (Compressed)</option>
    <option value="flac">FLAC (Lossless)</option>
    <option value="ogg">OGG Vorbis</option>
  </select>
  <button
    onClick={handleDownload}
    disabled={converting || (selectedFormat !== 'wav' && !loaded)}
    className="btn-primary"
  >
    {converting ? 'Converting...' : '⬇️ Download'}
  </button>
</div>
```

**Testing**:
1. Wait for ffmpeg.wasm to load (~3s)
2. Download as MP3 → verify size reduction (~10x)
3. Download as FLAC → verify lossless (~2x compression)
4. Download as OGG → verify quality
5. Test on 5-minute audio (stress test)
6. Verify memory cleanup after conversion
7. Test with weak CPU (conversion time)

---

### Feature 14: Saved Configurations with Library UI/UX ⭐⭐⭐⭐

**Complexity**: High
**Files Modified**:
- `web/src/server/db.ts` (schema migration)
- `web/src/index.ts` (new routes)
- `web/src/components/SavedConfigsLibrary.tsx` (new file)
- `web/src/App.tsx` (integration)

**Database Migration** (`server/db.ts`):
```typescript
// Add to migrations
db.run(`
  CREATE TABLE IF NOT EXISTS saved_configs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    settings_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_saved_configs_session
  ON saved_configs(session_id, created_at DESC)
`);
```

**Backend Routes** (`index.ts`):
```typescript
// List saved configs
routes["/api/configs"] = {
  GET: req => withSession(req, sessionId => {
    const rows = db.query(
      "SELECT * FROM saved_configs WHERE session_id = $sessionId ORDER BY created_at DESC"
    ).all({ sessionId });

    const configs = rows.map(row => ({
      ...row,
      settings: JSON.parse(row.settings_json)
    }));

    return Response.json({ configs });
  }),

  POST: req => withSession(req, async sessionId => {
    const { name, description, settings } = await req.json();

    const id = crypto.randomUUID();
    const now = Date.now();

    db.query(`
      INSERT INTO saved_configs (id, session_id, name, description, settings_json, created_at)
      VALUES ($id, $sessionId, $name, $description, $settings, $now)
    `).run({
      id,
      sessionId,
      name,
      description: description || null,
      settings: JSON.stringify(settings),
      now
    });

    return Response.json({ id, name, description, settings, created_at: now });
  })
};

// Individual config operations
routes["/api/configs/:id"] = {
  PUT: req => withSession(req, async sessionId => {
    const id = new URL(req.url).pathname.split('/').pop();
    const { name, description, settings } = await req.json();

    db.query(`
      UPDATE saved_configs
      SET name = $name, description = $description, settings_json = $settings
      WHERE id = $id AND session_id = $sessionId
    `).run({
      id,
      sessionId,
      name,
      description: description || null,
      settings: JSON.stringify(settings)
    });

    return Response.json({ success: true });
  }),

  DELETE: req => withSession(req, sessionId => {
    const id = new URL(req.url).pathname.split('/').pop();

    db.query(
      "DELETE FROM saved_configs WHERE id = $id AND session_id = $sessionId"
    ).run({ id, sessionId });

    return Response.json({ success: true });
  })
};
```

**Saved Configs Component** (`components/SavedConfigsLibrary.tsx`):
```typescript
import { useState, useEffect } from 'react';
import type { GenerationSettings } from '../types';

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  settings: GenerationSettings;
  created_at: number;
}

interface Props {
  onLoad: (settings: GenerationSettings) => void;
  currentSettings: GenerationSettings;
}

export function SavedConfigsLibrary({ onLoad, currentSettings }: Props) {
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const response = await fetch('/api/configs');
    const { configs: data } = await response.json();
    setConfigs(data);
  };

  const handleSave = async (name: string, description: string) => {
    const response = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        settings: currentSettings
      })
    });

    const config = await response.json();
    setConfigs(prev => [config, ...prev]);
    setShowSaveModal(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this configuration?')) return;

    await fetch(`/api/configs/${id}`, { method: 'DELETE' });
    setConfigs(prev => prev.filter(c => c.id !== id));
  };

  const handleLoad = (config: SavedConfig) => {
    onLoad(config.settings);
  };

  return (
    <div className="saved-configs-library">
      <div className="library-header">
        <h3>Saved Configurations</h3>
        <button
          onClick={() => setShowSaveModal(true)}
          className="btn-primary"
        >
          💾 Save Current
        </button>
      </div>

      {showSaveModal && (
        <SaveConfigModal
          onSave={handleSave}
          onCancel={() => setShowSaveModal(false)}
        />
      )}

      <div className="configs-grid">
        {configs.length === 0 ? (
          <div className="configs-empty">
            No saved configurations yet. Save your current settings to reuse them later.
          </div>
        ) : (
          configs.map(config => (
            <div key={config.id} className="config-card">
              <div className="config-header">
                <h4>{config.name}</h4>
                <span className="config-date">
                  {new Date(config.created_at).toLocaleDateString()}
                </span>
              </div>

              {config.description && (
                <p className="config-description">{config.description}</p>
              )}

              <div className="config-settings">
                <div className="config-setting">
                  <span>Preset:</span> <strong>{config.settings.preset}</strong>
                </div>
                <div className="config-setting">
                  <span>Method:</span> <strong>{config.settings.sample_method}</strong>
                </div>
                <div className="config-setting">
                  <span>Top K:</span> <strong>{config.settings.top_k}</strong>
                </div>
                <div className="config-setting">
                  <span>Top P:</span> <strong>{config.settings.top_p}</strong>
                </div>
              </div>

              <div className="config-actions">
                <button
                  onClick={() => handleLoad(config)}
                  className="btn-primary"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="btn-delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SaveConfigModal({ onSave, onCancel }: {
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name, description);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>Save Configuration</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Audiobook Narration"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn-primary">Save</button>
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**CSS Addition** (`index.css`):
```css
.saved-configs-library {
  margin-bottom: 2rem;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.config-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.config-header h4 {
  margin: 0;
  color: #667eea;
  font-size: 1.125rem;
}

.config-date {
  font-size: 0.75rem;
  color: #9ca3af;
}

.config-description {
  font-size: 0.875rem;
  color: #d1d5db;
  margin: 0;
}

.config-settings {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #9ca3af;
}

.config-setting span {
  color: #9ca3af;
}

.config-setting strong {
  color: #d1d5db;
}

.config-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.configs-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem;
  color: #9ca3af;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #d1d5db;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
```

**Testing**:
1. Save current settings with name + description
2. Load saved config → verify all settings match
3. Edit config name/description
4. Delete config
5. Save 10 configs with different presets
6. Verify grid layout responsive
7. Test export/import configs as JSON (bonus feature)

---

### PHASE 6 Deliverables Checklist
- [ ] Waveform visualization rendering correctly
- [ ] Reference audio library fully functional
- [ ] Audio format conversion working (MP3, FLAC, OGG)
- [ ] Saved configurations library complete
- [ ] All features tested end-to-end
- [ ] Performance acceptable (bundle size, memory, CPU)

---

## Dependencies

### Production Dependencies
```json
{
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.10",
    "@ffmpeg/util": "^0.12.1",
    "jszip": "^3.10.1"
  }
}
```

**Bundle Size Impact**:
- jszip: ~80KB gzipped
- @ffmpeg/ffmpeg: ~25MB (lazy loaded)
- Total: ~25.1MB (but ffmpeg only loads on-demand)

### Installation
```bash
bun add @ffmpeg/ffmpeg @ffmpeg/util jszip
```

---

## Database Schema Changes

### Migration Script
```typescript
// web/src/server/migrations.ts
export function runMigrations(db: Database) {
  console.log('Running database migrations...');

  const migrations = [
    // Migration 1: Add generation favorites and tags
    {
      name: 'add_generation_metadata',
      sql: `
        ALTER TABLE generations ADD COLUMN is_favorite INTEGER DEFAULT 0;
        ALTER TABLE generations ADD COLUMN tags TEXT DEFAULT '';
      `
    },

    // Migration 2: Create reference_audio table
    {
      name: 'create_reference_audio',
      sql: `
        CREATE TABLE IF NOT EXISTS reference_audio (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          name TEXT NOT NULL,
          transcript TEXT DEFAULT '',
          duration REAL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reference_audio_session
          ON reference_audio(session_id, created_at DESC);
      `
    },

    // Migration 3: Create saved_configs table
    {
      name: 'create_saved_configs',
      sql: `
        CREATE TABLE IF NOT EXISTS saved_configs (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          settings_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_saved_configs_session
          ON saved_configs(session_id, created_at DESC);
      `
    }
  ];

  for (const migration of migrations) {
    try {
      db.run(migration.sql);
      console.log(`✓ Migration: ${migration.name}`);
    } catch (err) {
      // Migration may have already run
      console.log(`⊘ Skipped: ${migration.name}`);
    }
  }
}
```

**Call in db.ts** after initial table creation:
```typescript
import { runMigrations } from './migrations';

// After creating sessions and generations tables
runMigrations(db);
```

---

## Testing Strategy

### Unit Testing
**Tools**: Vitest (Bun-compatible)

```bash
bun add -d vitest @testing-library/react @testing-library/jest-dom
```

**Test Files**:
- `utils/timeEstimator.test.ts`
- `hooks/useQueue.test.ts`
- `hooks/useIndexedDB.test.ts`
- `hooks/useAudioConverter.test.ts`

### Integration Testing
**Scenarios**:
1. Upload reference audio → save to library → use in generation
2. Add to queue → process queue → export results
3. Save config → load config → generate audio
4. Delete generation → verify file cleanup

### E2E Testing
**Tools**: Playwright

```bash
bun add -d playwright
```

**Test Flows**:
1. Complete generation workflow (upload → generate → download)
2. Library management (save → search → load → delete)
3. Queue processing (add → process → retry → clear)
4. Format conversion (generate → convert → download)

### Performance Testing
**Metrics**:
- Page load time: <2s
- IndexedDB read: <100ms
- Waveform render: <200ms
- ffmpeg.wasm load: <5s
- Format conversion: <3s per minute of audio

**Tools**:
- Chrome DevTools Performance tab
- Lighthouse CI
- Memory profiler

### Browser Compatibility Testing
**Browsers**:
- Chrome 120+
- Firefox 120+
- Safari 17+
- Edge 120+

**Mobile**:
- iOS Safari 17+
- Chrome Mobile 120+

---

## Risk Assessment

### High Risks

#### 1. ffmpeg.wasm Bundle Size (~25MB)
**Impact**: Slow initial load, high bandwidth usage
**Mitigation**:
- Lazy load ffmpeg.wasm only when user requests conversion
- Show loading indicator during load
- Cache in Service Worker for repeat visits
**Fallback**: Offer server-side conversion via Python backend

#### 2. IndexedDB Quota Limits
**Impact**: Storage failures on large reference audio libraries
**Mitigation**:
- Request persistent storage: `navigator.storage.persist()`
- Show storage usage warning at 80% quota
- Implement auto-cleanup of old entries
**Fallback**: Use File System Access API (Chrome-only)

#### 3. Queue Memory Leaks
**Impact**: Browser crashes during long queue processing
**Mitigation**:
- Clear completed items after 1 hour
- Limit queue to 50 items
- Add memory monitoring
**Testing**: Stress test with 100+ queued items

---

### Medium Risks

#### 1. Waveform Rendering Performance
**Impact**: Slow page load with many generations
**Mitigation**:
- Use requestAnimationFrame for rendering
- Lazy load waveforms (render on scroll)
- Cache waveform data in IndexedDB
**Fallback**: Static placeholder image

#### 2. Database Migration Failures
**Impact**: Features not working for existing users
**Mitigation**:
- Wrap migrations in try/catch
- Log migration errors
- Continue without new features if migration fails
**Testing**: Test migration on fresh DB and existing DB

#### 3. Cross-Browser Compatibility
**Impact**: Features broken on Safari/Firefox
**Mitigation**:
- Test on all major browsers
- Use polyfills where needed (Web Audio API)
- Progressive enhancement (graceful degradation)

---

### Low Risks

#### 1. Tooltip Clarity
**Impact**: Users confused by preset descriptions
**Mitigation**: User testing, iterate descriptions

#### 2. Drag-and-Drop Browser Support
**Impact**: Feature unavailable on older browsers
**Mitigation**: Progressive enhancement, keep file input as fallback

---

## Rollback Plan

### Safe Rollback Points
1. **After Phase 1**: Core functionality unchanged, only UI additions
2. **After Phase 2**: IndexedDB can be cleared without breaking app
3. **After Phase 3**: Exports are optional, no breaking changes
4. **After Phase 4**: Tooltip removal is trivial
5. **After Phase 5**: Queue is client-side only, no backend changes
6. **After Phase 6**: Heavy features can be feature-flagged

### Feature Flags
```typescript
// In localStorage
const FEATURES = {
  queue: localStorage.getItem('feature_queue') !== 'false',
  waveform: localStorage.getItem('feature_waveform') !== 'false',
  conversion: localStorage.getItem('feature_conversion') !== 'false',
  library: localStorage.getItem('feature_library') !== 'false',
};

// Conditional rendering
{FEATURES.queue && <GenerationQueue />}
{FEATURES.waveform && <WaveformVisualizer />}
```

### Database Rollback
```sql
-- Rollback all migrations (nuclear option)
DROP TABLE IF EXISTS saved_configs;
DROP TABLE IF EXISTS reference_audio;

-- Note: Cannot rollback ALTER TABLE in SQLite
-- Would need to recreate table without new columns
```

### File System Safety
- Never delete audio files without database confirmation
- Keep WAL file for automatic rollback (SQLite feature)
- Backup before bulk operations
- Implement soft deletes (mark as deleted, cleanup later)

---

## Success Metrics

### User Experience Metrics
- **Time to first generation**: <30s (including reference upload)
- **Storage cleanup adoption**: >50% of users use bulk delete
- **Queue usage**: >20% of sessions use queue feature
- **Library adoption**: >3 saved reference audios per active user
- **Config reuse**: >2 saved configs per active user
- **Export usage**: >10% of generations exported

### Technical Metrics
- **Page load time**: <2s (P95)
- **Error rate**: <1% on all operations
- **Conversion success**: >99% for MP3/FLAC
- **Memory leaks**: 0 detected in 24-hour stress test
- **Database integrity**: 100% (no orphaned files)

### Performance Benchmarks
| Operation | Target | Measured |
|-----------|--------|----------|
| Page load | <2s | TBD |
| IndexedDB read | <100ms | TBD |
| Waveform render | <200ms | TBD |
| ffmpeg.wasm load | <5s | TBD |
| Format conversion | <3s/min audio | TBD |

---

## Future Enhancements (Out of Scope)

These features are **not** included in this plan but could be considered for future development:

1. **Cloud Sync** (Firebase, Supabase) - Sync library across devices
2. **Batch Text Import** (CSV, TXT) - Import multiple texts at once
3. **Voice Cloning Fine-tuning** - Train custom models
4. **Real-time Streaming** - Stream audio as it generates
5. **Mobile App** (React Native) - Dedicated mobile experience
6. **Collaborative Sessions** (WebRTC) - Share generations with others
7. **AI-Generated Reference Text** - Auto-transcribe reference audio
8. **Audio Trimming/Editing** - Built-in audio editor
9. **Multi-language Support** - i18n for UI
10. **Analytics Dashboard** - Usage statistics and insights
11. **Keyboard Shortcuts Panel** - Searchable shortcut reference
12. **Theme Customization** - Custom colors and fonts
13. **Generation History Search** - Full-text search across all generations
14. **Favorites System** - Star favorite generations
15. **Tags/Labels** - Organize generations with tags

---

## Critical Files Summary

### Files to Create (21 new files)
```
web/src/
├── components/
│   ├── ReferenceAudioLibrary.tsx      # Feature 12
│   ├── GenerationQueue.tsx            # Feature 10
│   ├── WaveformVisualizer.tsx         # Feature 11
│   ├── GenerationItem.tsx             # Features 2, 8, 13
│   ├── SettingsPanel.tsx              # Features 9, 14
│   ├── TextInput.tsx                  # Feature 3
│   ├── StorageManager.tsx             # Feature 6
│   ├── SavedConfigsLibrary.tsx        # Feature 14
│   └── PresetTooltip.tsx              # Feature 9
├── hooks/
│   ├── useIndexedDB.ts                # Feature 5
│   ├── useQueue.ts                    # Feature 10
│   ├── useAudioExport.ts              # Features 8, 13
│   └── useAudioConverter.ts           # Feature 13
├── utils/
│   ├── audioConverter.ts              # Feature 13
│   ├── timeEstimator.ts               # Feature 3
│   └── presetDescriptions.ts          # Feature 9
├── types/
│   └── index.ts                       # Shared types
└── server/
    └── migrations.ts                  # Database migrations
```

### Files to Modify (3 existing files)
```
web/src/
├── App.tsx                            # All features (integration)
├── index.ts                           # Backend routes (Features 2, 6, 14)
├── index.css                          # Styling for all features
└── server/
    └── db.ts                          # Database schema (call migrations)
```

---

## Implementation Timeline

### Estimated Hours by Phase
| Phase | Features | Estimated Hours |
|-------|----------|-----------------|
| Phase 1 | Random seed, Delete, Character count, Auto-scroll | 3-4h |
| Phase 2 | IndexedDB, Storage manager | 3-4h |
| Phase 3 | Drag-drop, Export | 2-3h |
| Phase 4 | Tooltips | 1-2h |
| Phase 5 | Queue | 3-4h |
| Phase 6 | Waveform, Library, Conversion, Configs | 4-5h |
| **Total** | **14 features** | **16-22h** |

### Recommended Schedule
**Week 1**: Phases 1-2 (Quick wins + Storage management)
**Week 2**: Phases 3-4 (UX improvements + Tooltips)
**Week 3**: Phase 5 (Queue system)
**Week 4**: Phase 6 (Advanced features)

### Checkpoints
- **After Phase 2**: Review storage management effectiveness
- **After Phase 4**: Gather user feedback on UX
- **After Phase 6**: Full integration testing

---

## Conclusion

This comprehensive plan delivers **14 production-ready features** across **6 logical phases**, prioritizing quick wins and addressing critical pain points (storage management) early. The architecture leverages existing patterns while introducing minimal dependencies (jszip, ffmpeg.wasm).

**Key Strengths**:
- Clear phase boundaries with deliverable checklists
- Detailed code examples for all features
- Comprehensive testing strategy
- Risk mitigation for high-impact issues
- Rollback plan for safe deployment

**Recommended Approach**:
1. Implement Phases 1-4 first (core functionality) - 9-12 hours
2. Evaluate user needs before committing to Phases 5-6
3. Use feature flags for easy rollback
4. Test thoroughly at each phase boundary

Total implementation time: **16-22 hours** for a skilled developer familiar with React, TypeScript, and Bun.

---

## Next Steps

1. **Create `docs/` folder** - Move this plan to `/media/josh_emperor/EtherNexus/GLM-TTS/docs/FEATURES_PLAN.md`
2. **Review with stakeholders** - Confirm priorities and timeline
3. **Set up development environment** - Install dependencies, create feature branch
4. **Begin Phase 1 implementation** - Start with quick wins for immediate value
5. **Iterate based on feedback** - Adjust plan as needed during development

---

**Document Version**: 1.0
**Last Updated**: 2025-12-28
**Author**: Claude Code Planning Agent
**Status**: Ready for Implementation
