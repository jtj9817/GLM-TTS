import { useState, useEffect } from "react";
import type { StorageInfo } from "../types";

interface Props {
  onCleanup: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function StorageManager({ onCleanup }: Props) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/storage/info");
      if (!response.ok) {
        throw new Error("Failed to fetch storage info");
      }
      const data = await response.json();
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storage info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const handleCleanup = async (days: number) => {
    const message =
      days === 0
        ? "Delete ALL generations? This action cannot be undone."
        : `Delete all generations older than ${days} days? This action cannot be undone.`;

    if (!confirm(message)) return;

    setCleanupLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/storage/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: days }),
      });

      if (!response.ok) {
        throw new Error("Cleanup failed");
      }

      const { deleted, bytesFreed } = await response.json();
      alert(`Deleted ${deleted} generations (${formatBytes(bytesFreed)} freed)`);

      await loadInfo();
      onCleanup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleanupLoading(false);
    }
  };

  if (loading && !info) {
    return (
      <div className="storage-manager">
        <h3>Storage Usage</h3>
        <div className="storage-loading">Loading storage info...</div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="storage-manager">
        <h3>Storage Usage</h3>
        <div className="storage-error">{error}</div>
        <button onClick={loadInfo} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="storage-manager">
      <div className="storage-header">
        <h3>Storage Usage</h3>
        <button onClick={loadInfo} className="btn-icon-small" title="Refresh" disabled={loading}>
          {loading ? "..." : "\u21BB"}
        </button>
      </div>

      {error && <div className="storage-error">{error}</div>}

      <div className="storage-stats">
        <div className="stat">
          <span className="stat-label">Audio Files</span>
          <span className="stat-value">
            {info.fileCount} files ({formatBytes(info.totalBytes)})
          </span>
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
          disabled={cleanupLoading || info.fileCount === 0}
          className="btn-warning"
        >
          Delete &gt;7 days
        </button>
        <button
          onClick={() => handleCleanup(30)}
          disabled={cleanupLoading || info.fileCount === 0}
          className="btn-warning"
        >
          Delete &gt;30 days
        </button>
        <button
          onClick={() => handleCleanup(0)}
          disabled={cleanupLoading || info.fileCount === 0}
          className="btn-danger"
        >
          Delete All
        </button>
      </div>
    </div>
  );
}
