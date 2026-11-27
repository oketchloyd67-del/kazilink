const buckets = new Map();

export function rateLimit({ windowMs = 10 * 60_000, max = 20, keyPrefix = 'general' } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const record = buckets.get(key);
    if (!record || now - record.start > windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return next();
    }
    record.count += 1;
    if (record.count > max) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of buckets) {
    if (now - record.start > 60 * 60_000) buckets.delete(key);
  }
}, 10 * 60_000).unref();
