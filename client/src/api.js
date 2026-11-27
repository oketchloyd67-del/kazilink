export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api(path, { method = 'GET', body, form, signal, retries, timeoutMs = 20_000 } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: {},
    signal,
  };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const attempts = retries ?? (method === 'GET' ? 2 : 0);
  let lastError;

  for (let attempt = 0; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener?.('abort', onAbort);

    try {
      const res = await fetch(`/api${path}`, { ...options, signal: controller.signal });
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);

      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < attempts) {
        await sleep(700 * (attempt + 1));
        continue;
      }

      let data = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try { data = await res.json(); } catch { data = null; }
      }

      if (!res.ok) {
        throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status, data);
      }
      return data;
    } catch (error) {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      lastError = error;

      if (error instanceof ApiError) throw error;
      if (error.name === 'AbortError' && signal?.aborted) throw new ApiError('Request cancelled.', 0);
      if (attempt < attempts) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiError('You are offline. Your data will load when the connection returns.', 0);
      }
      throw new ApiError(
        error.name === 'AbortError'
          ? 'The connection is too slow to finish this request. Check your signal and try again.'
          : 'We could not reach KaziLink. Check your connection and try again.',
        0,
      );
    }
  }
  throw lastError || new ApiError('Request failed.', 0);
}

export const getDeviceId = () => {
  const key = 'kazilink_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(key, id);
  }
  return id;
};

export const saveReferral = (ref) => {
  if (!ref) return;
  try { sessionStorage.setItem('kazilink_ref', ref); } catch {}
};

export const readReferral = () => {
  try { return sessionStorage.getItem('kazilink_ref') || ''; } catch { return ''; }
};
