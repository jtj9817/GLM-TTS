import type { QueueItem } from "../hooks/useQueue";

interface Props {
  queue: QueueItem[];
  isProcessing: boolean;
  currentItem: QueueItem | null;
  apiBase?: string;
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
  apiBase = "",
  onRemove,
  onProcess,
  onClearCompleted,
  onClearAll,
  onRetryFailed,
}: Props) {
  const pending = queue.filter(item => item.status === "pending").length;
  const completed = queue.filter(item => item.status === "completed").length;
  const failed = queue.filter(item => item.status === "failed").length;
  const processingLabel = currentItem?.text.slice(0, 20) ?? "item";

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
          {isProcessing ? `Processing... (${processingLabel}...)` : `Start Queue (${pending})`}
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
            <div key={item.id} className={`queue-item queue-item-${item.status}`}>
              <div className="queue-item-header">
                <span className="queue-status-icon">
                  {item.status === "pending" && "⏸️"}
                  {item.status === "processing" && "⚙️"}
                  {item.status === "completed" && "✅"}
                  {item.status === "failed" && "❌"}
                </span>
                <span className="queue-status-text">{item.status}</span>
              </div>

              <div className="queue-item-body">
                <div className="queue-text" title={item.text}>
                  {item.text}
                </div>
                <div className="queue-meta">
                  Preset: {item.settings.preset} | Seed: {item.seed}
                </div>
                {item.error && <div className="queue-error">Error: {item.error}</div>}
              </div>

              <div className="queue-item-actions">
                {item.status === "pending" && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="btn-delete"
                    type="button"
                    title="Remove from queue"
                  >
                    🗑️
                  </button>
                )}
                {item.status === "completed" && item.resultId && (
                  <a
                    href={`${apiBase}/api/generations/${item.resultId}/audio`}
                    download
                    className="btn-icon"
                    title="Download audio"
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
