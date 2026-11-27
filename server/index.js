import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { db, start } from './db.js';
import { migrate } from './migrate.js';
import { seedStatic } from './seed.js';
import { attachUser } from './services/auth.js';
import authRoutes from './routes/auth.js';
import activationRoutes from './routes/activation.js';
import walletRoutes from './routes/wallet.js';
import videoRoutes from './routes/videos.js';
import statusRoutes from './routes/status.js';
import sudokuRoutes from './routes/sudoku.js';
import adminRoutes from './routes/admin.js';
import securityRoutes from './routes/security.js';
import pushRoutes from './routes/push.js';
import trainingRoutes from './routes/training.js';
import leaderboardRoutes from './routes/leaderboard.js';
import supportRoutes from './routes/support.js';
import { rateLimit } from './lib/ratelimit.js';

const app = express();


start().then(() => console.log('[db] connected'), (error) => {
  console.error('[db] connection failed', error);
  if (error.code === 'ECONNREFUSED') {
    console.error('PostgreSQL is not running or not accepting connections.');
    console.error('Start PostgreSQL: sudo systemctl start postgresql');
  } else if (error.code === '28P01') {
    console.error('Authentication failed. Check your DATABASE_URL password in .env');
  } else if (error.code === '3D000') {
    console.error('Database does not exist. Create it: sudo -u postgres psql -c "CREATE DATABASE kazilink OWNER kazilink;"');
  }
  process.exit(1);
});

// Run migrations and seed on startup
async function initialize() {
  try {
    await migrate();
    await seedStatic();
    console.log('[db] migrations and seed complete');
  } catch (error) {
    console.error('[db] initialization failed:', error.message);
    process.exit(1);
  }
}

initialize().then(() => {
  app.disable('x-powered-by');
  if (config.uploadsDir) fs.mkdirSync(config.uploadsDir, { recursive: true });
}, () => {});

// Safety checks in production
if (config.isProd) {
  if (!config._sessionSecretValid()) {
    console.error('[security] SESSION_SECRET must be at least 32 characters in production.');
    console.error('[security] Generate one with: node -e "console.log(require(\"crypto\").randomBytes(48).toString(\"base64\"))"');
    process.exit(1);
  }
  if (config.adminPassword === 'Admin@12345') {
    console.warn('[security] ADMIN_PASSWORD is the default value. Change it in .env for production.');
  }
}


app.set('trust proxy', config.trustProxy);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' https: blob:; connect-src 'self'; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  );
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      const allowed = new Set([config.appOrigin]);
      if (req.headers.host) {
        allowed.add(`https://${req.headers.host}`);
        allowed.add(`http://${req.headers.host}`);
      }
      if (!allowed.has(origin)) {
        return res.status(403).json({ error: 'This request was blocked for security reasons.' });
      }
    }
  }
  next();
});

app.use('/api', rateLimit({ windowMs: 60_000, max: 900, keyPrefix: 'api' }), attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'kazilink', time: new Date().toISOString() }));
app.get('/api/public-config', (_req, res) => res.json({
  whatsappChannelUrl: config.whatsappChannelUrl,
  activationFeeCents: config.activationFeeCents,
  leaderboardVoucherCents: config.leaderboard.voucherCents,
  trainingTermDays: config.trainingTermDays,
  currency: config.currency,
}));
app.use('/api/auth', authRoutes);
app.use('/api/auth', securityRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/activation', activationRoutes);
app.use('/api', walletRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/sudoku', sudokuRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(503).send('KaziLink client has not been built yet. Run “npm run dev” or “npm run build”.');
  });
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Screenshot must be 5MB or smaller.' : 'Upload failed.';
    return res.status(400).json({ error: message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});

app.listen(config.port, () => {
  console.log(`[kazilink] API listening on http://localhost:${config.port} (${config.isProd ? 'production' : 'development'})`);
  console.log(`[kazilink] Payments: ${config.tuma.configured ? 'Tuma live mode' : 'sandbox simulation'}`);
  console.log(`[kazilink] Email: ${config.email.resendKey ? 'Resend' : config.email.smtpHost ? 'SMTP' : 'console fallback'}`);
});

