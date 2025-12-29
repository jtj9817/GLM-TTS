import { useState, useEffect, useCallback } from "react";
import type { ReferenceAudioEntry, GenerationConfigEntry } from "../types";

const DB_NAME = "glmtts";
const DB_VERSION = 2;
const STORE_NAME = "referenceAudio";
const CONFIGS_STORE_NAME = "generationConfigs";

export function useReferenceAudioDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB failed to open:", request.error);
      setError("Failed to open IndexedDB");
    };

    request.onsuccess = () => {
      setDb(request.result);
      setReady(true);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Reference audio store
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Generation configs store (added in v2)
      if (!database.objectStoreNames.contains(CONFIGS_STORE_NAME)) {
        const configStore = database.createObjectStore(CONFIGS_STORE_NAME, { keyPath: "id" });
        configStore.createIndex("name", "name", { unique: false });
        configStore.createIndex("createdAt", "createdAt", { unique: false });
        configStore.createIndex("referenceVoiceId", "referenceVoiceId", { unique: false });
      }
    };

    return () => {
      db?.close();
    };
  }, []);

  const saveAudio = useCallback(
    async (entry: ReferenceAudioEntry): Promise<void> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry); // Use put instead of add to allow updates

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const loadAudio = useCallback(
    async (id: string): Promise<ReferenceAudioEntry | null> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const listAudio = useCallback(async (): Promise<ReferenceAudioEntry[]> => {
    if (!db) throw new Error("Database not ready");

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by createdAt descending (newest first)
        const results = request.result as ReferenceAudioEntry[];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  const deleteAudio = useCallback(
    async (id: string): Promise<void> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const clearAll = useCallback(async (): Promise<void> => {
    if (!db) throw new Error("Database not ready");

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  const getStorageEstimate = useCallback(async (): Promise<{
    used: number;
    quota: number;
  } | null> => {
    if (!navigator.storage?.estimate) return null;
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
      };
    } catch {
      return null;
    }
  }, []);

  return {
    saveAudio,
    loadAudio,
    listAudio,
    deleteAudio,
    clearAll,
    getStorageEstimate,
    ready,
    error,
  };
}

// Hook for Generation Configs (text pairs with optional voice reference)
export function useGenerationConfigDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB failed to open:", request.error);
      setError("Failed to open IndexedDB");
    };

    request.onsuccess = () => {
      setDb(request.result);
      setReady(true);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Reference audio store
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Generation configs store (added in v2)
      if (!database.objectStoreNames.contains(CONFIGS_STORE_NAME)) {
        const configStore = database.createObjectStore(CONFIGS_STORE_NAME, { keyPath: "id" });
        configStore.createIndex("name", "name", { unique: false });
        configStore.createIndex("createdAt", "createdAt", { unique: false });
        configStore.createIndex("referenceVoiceId", "referenceVoiceId", { unique: false });
      }
    };

    return () => {
      db?.close();
    };
  }, []);

  const saveConfig = useCallback(
    async (entry: GenerationConfigEntry): Promise<void> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIGS_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CONFIGS_STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const loadConfig = useCallback(
    async (id: string): Promise<GenerationConfigEntry | null> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIGS_STORE_NAME, "readonly");
        const store = transaction.objectStore(CONFIGS_STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const listConfigs = useCallback(async (): Promise<GenerationConfigEntry[]> => {
    if (!db) throw new Error("Database not ready");

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIGS_STORE_NAME, "readonly");
      const store = transaction.objectStore(CONFIGS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as GenerationConfigEntry[];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  const updateConfig = useCallback(
    async (entry: GenerationConfigEntry): Promise<void> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIGS_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CONFIGS_STORE_NAME);
        const request = store.put({ ...entry, updatedAt: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const deleteConfig = useCallback(
    async (id: string): Promise<void> => {
      if (!db) throw new Error("Database not ready");

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIGS_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CONFIGS_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    [db],
  );

  const clearAllConfigs = useCallback(async (): Promise<void> => {
    if (!db) throw new Error("Database not ready");

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIGS_STORE_NAME, "readwrite");
      const store = transaction.objectStore(CONFIGS_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  return {
    saveConfig,
    loadConfig,
    listConfigs,
    updateConfig,
    deleteConfig,
    clearAllConfigs,
    ready,
    error,
  };
}

// Helper function to extract audio duration from blob
export async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio for duration"));
    };

    audio.src = url;
  });
}
