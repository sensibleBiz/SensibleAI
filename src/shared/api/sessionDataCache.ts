const CACHE_PREFIX = "sensible-crm:session-data:v1:";
const MAX_CACHE_ENTRIES = 200;

interface StoredCacheEntry<T> {
  storedAt: number;
  value: T;
}

const memoryCache = new Map<string, StoredCacheEntry<unknown>>();

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const fullKey = (key: string) => `${CACHE_PREFIX}${key}`;

const pruneOldestEntries = () => {
  const cacheStorage = storage();
  if (!cacheStorage) return;

  const entries: Array<{ key: string; storedAt: number }> = [];
  for (let index = 0; index < cacheStorage.length; index += 1) {
    const key = cacheStorage.key(index);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      const entry = JSON.parse(cacheStorage.getItem(key) ?? "") as {
        storedAt?: unknown;
      };
      entries.push({
        key,
        storedAt:
          typeof entry.storedAt === "number" ? entry.storedAt : 0,
      });
    } catch {
      cacheStorage.removeItem(key);
    }
  }

  entries
    .sort((left, right) => left.storedAt - right.storedAt)
    .slice(0, Math.max(0, entries.length - MAX_CACHE_ENTRIES + 1))
    .forEach(({ key }) => {
      cacheStorage.removeItem(key);
      memoryCache.delete(key);
    });
};

export const sessionDataCache = {
  get<T>(key: string): T | null {
    const keyWithPrefix = fullKey(key);
    const memoryEntry = memoryCache.get(keyWithPrefix);
    if (memoryEntry) return memoryEntry.value as T;

    const cacheStorage = storage();
    const rawValue = cacheStorage?.getItem(keyWithPrefix);
    if (!rawValue) return null;
    try {
      const entry = JSON.parse(rawValue) as StoredCacheEntry<T>;
      if (!entry || typeof entry.storedAt !== "number") {
        cacheStorage?.removeItem(keyWithPrefix);
        return null;
      }
      memoryCache.set(keyWithPrefix, entry);
      return entry.value;
    } catch {
      cacheStorage?.removeItem(keyWithPrefix);
      return null;
    }
  },

  set<T>(key: string, value: T) {
    const keyWithPrefix = fullKey(key);
    const entry: StoredCacheEntry<T> = { storedAt: Date.now(), value };
    memoryCache.set(keyWithPrefix, entry);
    while (memoryCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = memoryCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      memoryCache.delete(oldestKey);
    }

    const cacheStorage = storage();
    if (!cacheStorage) return;
    pruneOldestEntries();
    try {
      cacheStorage.setItem(keyWithPrefix, JSON.stringify(entry));
    } catch {
      // Storage quota can be smaller on private/mobile browsers. Keep the
      // in-memory cache and remove older persisted entries before retrying.
      clearPersistedSessionDataCache();
      try {
        cacheStorage.setItem(keyWithPrefix, JSON.stringify(entry));
      } catch {
        // The feature remains functional without persistence for this tab.
      }
    }
  },

  deleteWhere(matches: (key: string) => boolean) {
    for (const key of [...memoryCache.keys()]) {
      const unprefixedKey = key.slice(CACHE_PREFIX.length);
      if (matches(unprefixedKey)) memoryCache.delete(key);
    }

    const cacheStorage = storage();
    if (!cacheStorage) return;
    const keysToDelete: string[] = [];
    for (let index = 0; index < cacheStorage.length; index += 1) {
      const key = cacheStorage.key(index);
      if (
        key?.startsWith(CACHE_PREFIX) &&
        matches(key.slice(CACHE_PREFIX.length))
      ) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => cacheStorage.removeItem(key));
  },
};

const clearPersistedSessionDataCache = () => {
  const cacheStorage = storage();
  if (!cacheStorage) return;
  const keysToDelete: string[] = [];
  for (let index = 0; index < cacheStorage.length; index += 1) {
    const key = cacheStorage.key(index);
    if (key?.startsWith(CACHE_PREFIX)) keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => cacheStorage.removeItem(key));
};

export const clearSessionDataCache = () => {
  memoryCache.clear();
  clearPersistedSessionDataCache();
};
