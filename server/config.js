import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  root,
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',

  // Production safety checks
  _sessionSecretValid: function() {
    const secret = this.sessionSecret;
    return secret && secret.length >= 32;
  },
  port: int(process.env.PORT, 4000),
  pgDataDir: process.env.PG_DATA_DIR || '/tmp/pgdata',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kazilink:kazilink@localhost:5432/kazilink',
  dbPoolSize: int(process.env.DB_POOL_SIZE, 10),
  databaseSsl: process.env.DATABASE_SSL === '1',
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'kazilink.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(root, 'data', 'uploads'),
  distDir: path.join(root, 'dist'),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  trustProxy: process.env.TRUST_PROXY === '1',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me-please',
  sessionTtlMinutes: int(process.env.SESSION_TTL_MINUTES, 720),
  idleTimeoutMinutes: int(process.env.IDLE_TIMEOUT_MINUTES, 20),
  cookieName: 'kazi_sid',

  activationFeeCents: int(process.env.ACTIVATION_FEE_CENTS, 10000),
  referralCommissionPercent: 20,
  currency: 'KES',
  whatsappChannelUrl: process.env.WHATSAPP_CHANNEL_URL || 'https://whatsapp.com/channel/',
  leaderboard: {
    voucherCents: int(process.env.LEADERBOARD_VOUCHER_CENTS, 100000),
    claimFeeCents: int(process.env.LEADERBOARD_CLAIM_FEE_CENTS, 10000),
  },
  crypto: {
    minCents: int(process.env.CRYPTO_MIN_WITHDRAW_CENTS, 10000),
    networks: ['Bitcoin (BTC)', 'Ethereum (ETH)', 'USDT (TRC-20)', 'USDT (ERC-20)', 'Solana (SOL)'],
  },
  trainingTermDays: int(process.env.TRAINING_TERM_DAYS, 90),
  webPush: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:no-reply@kazilink.app',
  },
  supportEmail: process.env.SUPPORT_INBOX || (process.env.ADMIN_EMAIL || 'admin@kazilink.app'),

  adminEmail: (process.env.ADMIN_EMAIL || 'admin@kazilink.app').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'Vermon0)0@2',

  otpTtlMinutes: int(process.env.OTP_TTL_MINUTES, 10),

  tuma: {
    baseUrl: process.env.TUMA_API_BASE || '',
    apiKey: process.env.TUMA_API_KEY || '',
    accountId: process.env.TUMA_ACCOUNT_ID || '',
    configured: Boolean(process.env.TUMA_API_KEY && process.env.TUMA_API_BASE),
  },

  email: {
    resendKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'KaziLink <no-reply@kazilink.app>',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: int(process.env.SMTP_PORT, 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
  },
};

export const WITHDRAW_BUCKETS = {
  affiliate: { label: 'Affiliate marketing', minCents: 25000, maxCents: 150000 },
  videos: { label: 'Watching videos', minCents: 100000, maxCents: 250000 },
  status: { label: 'WhatsApp status', minCents: 200000, maxCents: 500000 },
  sudoku: { label: 'Sudoku winnings', minCents: 60000, maxCents: 120000 },
  wallet: { label: 'Wallet / P2P balance', minCents: 10000, maxCents: 500000 },
};

export const VIDEO_TASK_REWARDS = {
  follow: 2000,
  like: 500,
  comment: 700,
  share: 300,
};

export const VIDEO_MAX_REWARD_CENTS = 9000;
export const STATUS_REWARD_PER_VIEWER_CENTS = 1500;
export const SUDOKU_FEE_CENTS = 3000;
export const SUDOKU_WIN_MULTIPLIER = 3;
export const SUDOKU_SECONDS = 60;
export const SUDOKU_GAMES_PER_DAY = 3;
