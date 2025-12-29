import { useRef, useState } from "react";
import type { GenerationSettings } from "../types";

export interface QueueItem {
  id: string;
  text: string;
  referenceAudioId: string;
  referenceAudioFile?: File;
  referenceTranscript: string;
  settings: GenerationSettings;
  seed: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  resultId?: string;
  addedAt: number;
  completedAt?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);
  const cancelRef = useRef(false);

  const addToQueue = (item: Omit<QueueItem, "id" | "status" | "addedAt">) => {
    const newItem: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      status: "pending",
      addedAt: Date.now(),
    };

    setQueue(prev => [...prev, newItem]);
    return newItem.id;
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== "completed"));
  };

  const clearAll = () => {
    if (isProcessing) {
      if (!confirm("Queue is processing. Stop and clear all?")) return;
      cancelRef.current = true;
    }
    setQueue([]);
    setIsProcessing(false);
    setCurrentItem(null);
  };

  const processQueue = async (
    synthesizeFn: (item: QueueItem) => Promise<{ id: string }>,
  ) => {
    if (isProcessing) return;

    const pendingItems = queue.filter(item => item.status === "pending");
    if (pendingItems.length === 0) return;

    cancelRef.current = false;
    setIsProcessing(true);

    for (const [index, item] of pendingItems.entries()) {
      if (cancelRef.current) break;
      setCurrentItem(item);
      setQueue(prev =>
        prev.map(i => (i.id === item.id ? { ...i, status: "processing" as const } : i)),
      );

      try {
        const result = await synthesizeFn(item);
        if (!cancelRef.current) {
          setQueue(prev =>
            prev.map(i =>
              i.id === item.id
                ? {
                    ...i,
                    status: "completed" as const,
                    resultId: result.id,
                    completedAt: Date.now(),
                  }
                : i,
            ),
          );
        }
      } catch (error) {
        if (!cancelRef.current) {
          const message = error instanceof Error ? error.message : "Unknown error";
          setQueue(prev =>
            prev.map(i =>
              i.id === item.id
                ? {
                    ...i,
                    status: "failed" as const,
                    error: message,
                    completedAt: Date.now(),
                  }
                : i,
            ),
          );
        }
      }

      if (cancelRef.current) break;

      if (index < pendingItems.length - 1) {
        await delay(1000);
      }
    }

    setIsProcessing(false);
    setCurrentItem(null);
    cancelRef.current = false;
  };

  const retryFailed = () => {
    setQueue(prev =>
      prev.map(item =>
        item.status === "failed"
          ? { ...item, status: "pending", error: undefined, completedAt: undefined }
          : item,
      ),
    );
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
    retryFailed,
  };
}
