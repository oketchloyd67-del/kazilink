import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const CACHE_PREFIX = 'kazilink:cache:';
const memory = new Map();

function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  memory.set(key, value);
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
  }
}

export function clearResourceCache() {
  memory.clear();
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
  }
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function useResource(path, { enabled = true, cacheKey } = {}) {
  const key = cacheKey || path;
  const [data, setData] = useState(() => (enabled ? readCache(key) : null));
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    const cached = readCache(key);
    setData(cached);
    setError(null);
    setStale(false);
    setLoading(true);

    api(path, { signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        writeCache(key, result);
        setStale(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        if (cached) setStale(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, enabled, nonce, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, stale, reload, setData };
}

export function useAutoRefreshOnReconnect(reload) {
  const online = useOnline();
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      reload?.();
    }
  }, [online, reload]);
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · KaziLink` : 'KaziLink — Earn from your phone';
  }, [title]);
}
