interface PromiseCacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

interface PromiseTtlCacheOptions {
  maxEntries: number;
  ttlMs: number;
}

export const createPromiseTtlCache = <T>({
  maxEntries,
  ttlMs,
}: PromiseTtlCacheOptions) => {
  const entries = new Map<string, PromiseCacheEntry<T>>();

  const removeExpiredEntries = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  };

  return {
    clear() {
      entries.clear();
    },

    deleteWhere(matches: (key: string) => boolean) {
      for (const key of entries.keys()) {
        if (matches(key)) entries.delete(key);
      }
    },

    get(key: string, load: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now) return cached.promise;

      if (cached) entries.delete(key);
      removeExpiredEntries(now);

      while (entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (!oldestKey) break;
        entries.delete(oldestKey);
      }

      const promise = load();
      entries.set(key, { expiresAt: now + ttlMs, promise });
      void promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      return promise;
    },
  };
};
