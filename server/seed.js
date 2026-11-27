import bcrypt from 'bcryptjs';
import { db, ensureWallet } from './db.js';
import { config } from './config.js';
import { makePublicId, todayKey } from './lib/util.js';

const now = () => new Date().toISOString();

const creators = [
  { name: 'Amina Wanjiru', handle: '@amina.creates', platform: 'TikTok', followers: 184200, bio: 'Lifestyle & small business stories from Nairobi.', accent: '#7c5cff' },
  { name: 'Brian Otieno', handle: '@briano.fit', platform: 'Instagram', followers: 92500, bio: 'Fitness, food and daily hustle tips.', accent: '#ff7a59' },
  { name: 'Zawadi Muthoni', handle: '@zawadi.m', platform: 'TikTok', followers: 310800, bio: 'Travel, culture and creative confidence.', accent: '#00b894' },
];

const videos = [
  {
    creator: '@amina.creates',
    title: 'How I grew my thrift shop with zero ads',
    description: 'A 60 second breakdown of the exact content routine Amina used to turn a single stall into a queue of repeat customers.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    duration: 60,
  },
  {
    creator: '@briano.fit',
    title: 'Three habits that changed my mornings',
    description: 'Small, repeatable actions that make a 6am start feel easy. Watch to the end for the bonus habit.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
  },
  {
    creator: '@zawadi.m',
    title: 'The 5-shot rule for better phone photos',
    description: 'Zawadi shares the quick framing trick she uses before every shoot.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    duration: 15,
  },
  {
    creator: '@amina.creates',
    title: 'Packaging that makes customers keep the box',
    description: 'Cheap, thoughtful packaging ideas that turn first orders into referrals.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    duration: 15,
  },
  {
    creator: '@briano.fit',
    title: 'A 60-second reset you can do at your desk',
    description: 'The mobility sequence Brian uses between deliveries to stay loose.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    duration: 15,
  },
  {
    creator: '@zawadi.m',
    title: 'Reading a room before you pitch',
    description: 'How to spot the right moment to share your offer, without being pushy.',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
  },
];

const products = [
  {
    name: 'Safari Bloom Tote',
    description: 'Hand-printed canvas tote from a Nairobi studio. Share the offer on your status and earn per view.',
    image: '/img/product-tote.svg',
    price: 245000,
  },
  {
    name: 'Chai & Chill Gift Set',
    description: 'Kenyan tea blends in a reusable tin, bundled with a hand-poured candle.',
    image: '/img/product-gift.svg',
    price: 189000,
  },
  {
    name: 'Kilifi Weekend Pass',
    description: 'A curated two-day coast itinerary with partner discounts and a sunset dhow ride.',
    image: '/img/product-coast.svg',
    price: 550000,
  },
  {
    name: 'Everyday Jute Sneakers',
    description: 'Lightweight sneakers made from reclaimed canvas, sized to move fast.',
    image: '/img/product-sneakers.svg',
    price: 320000,
  },
];

const trainingCourses = [
  {
    slug: 'cyber-security',
    title: 'Cyber Security Fundamentals',
    summary: 'Learn how to protect devices, accounts and small businesses from modern attacks.',
    description: 'A practical introduction to digital safety: passwords, phishing, safe browsing, device hardening, backups and incident response. Built for beginners and small business owners.',
    price: 120000,
    level: 'Beginner',
    days: 'Monday & Wednesday',
    time: '7:00 PM – 9:00 PM',
    weeks: 12,
    curriculum: ['Passwords and account security', 'Phishing and social engineering', 'Device and network hardening', 'Safe browsing and mobile security', 'Backups and recovery', 'Responding to an incident'],
    accent: '#5b3df5',
  },
  {
    slug: 'web-development',
    title: 'Web Development Bootcamp',
    summary: 'Build responsive websites and simple web apps from scratch, with real projects.',
    description: 'HTML, CSS, JavaScript and modern tooling, taught through weekly builds. You will publish a portfolio site, a business landing page and a small interactive app.',
    price: 180000,
    level: 'Beginner to intermediate',
    days: 'Tuesday & Thursday',
    time: '7:00 PM – 9:00 PM',
    weeks: 12,
    curriculum: ['HTML and semantic structure', 'Responsive CSS layouts', 'JavaScript essentials', 'Working with APIs', 'Git and deployment', 'Portfolio project'],
    accent: '#0f9b6c',
  },
  {
    slug: 'penetration-testing',
    title: 'Ethical Penetration Testing',
    summary: 'Think like an attacker, test like a professional, and report findings responsibly.',
    description: 'Hands-on ethical hacking labs covering reconnaissance, web application testing, common vulnerabilities, reporting and responsible disclosure. Students must agree to use the skills legally and only on systems they are authorised to test.',
    price: 250000,
    level: 'Intermediate',
    days: 'Saturday',
    time: '10:00 AM – 1:00 PM',
    weeks: 12,
    curriculum: ['Reconnaissance and scoping', 'Web application testing', 'Authentication and access control', 'Common vulnerability classes', 'Professional reporting', 'Legal and ethical boundaries'],
    accent: '#c14860',
  },
];

export async function seedStatic() {
  const existingAdmin = await db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(config.adminPassword, 12);
    const info = await db.prepare(`INSERT INTO users
      (public_id, email, username, password_hash, first_name, last_name, phone, role, status, created_at, activated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'active', ?, ?)`)
      .run(makePublicId(), config.adminEmail, 'kazilink_admin', hash, 'KaziLink', 'Admin', '254700000000', now(), now());
    await ensureWallet(info.lastInsertRowid);
    console.log(`[seed] Admin account: ${config.adminEmail} / ${config.adminPassword}`);
  }

  const creatorsCount = await db.prepare('SELECT COUNT(*) AS c FROM creators').get();
  if (Number(creatorsCount?.c) === 0) {
    const insertCreator = db.prepare('INSERT INTO creators (name, handle, platform, followers, bio, accent) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of creators) await insertCreator.run(c.name, c.handle, c.platform, c.followers, c.bio, c.accent);
  }

  const videosCount = await db.prepare('SELECT COUNT(*) AS c FROM videos').get();
  if (Number(videosCount?.c) === 0) {
    const creatorMap = new Map((await db.prepare('SELECT id, handle FROM creators').all()).map((c) => [c.handle, c.id]));
    const insertVideo = db.prepare(`INSERT INTO videos (creator_id, title, description, video_url, duration_seconds, reward_max_cents)
      VALUES (?, ?, ?, ?, ?, 9000)`);
    for (const v of videos) await insertVideo.run(creatorMap.get(v.creator), v.title, v.description, v.url, v.duration);
  }

  const productsCount = await db.prepare('SELECT COUNT(*) AS c FROM products').get();
  if (Number(productsCount?.c) === 0) {
    const insertProduct = db.prepare('INSERT INTO products (name, description, image_url, price_cents) VALUES (?, ?, ?, ?)');
    for (const p of products) await insertProduct.run(p.name, p.description, p.image, p.price);
  }

  const insertCourse = db.prepare(`INSERT OR IGNORE INTO training_courses
    (slug, title, summary, description, price_cents, level, schedule_days, schedule_time, duration_weeks, curriculum, accent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, course] of trainingCourses.entries()) {
    await insertCourse.run(
      course.slug, course.title, course.summary, course.description, course.price, course.level,
      course.days, course.time, course.weeks, JSON.stringify(course.curriculum), course.accent, index + 1,
    );
  }

  const settingDefaults = {
    activation_fee_cents: String(config.activationFeeCents),
    video_reward_max_cents: '9000',
    status_reward_per_view_cents: '1500',
    sudoku_fee_cents: '3000',
    maintenance_mode: '0',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settingDefaults)) await insertSetting.run(key, value);
  await db.prepare(`UPDATE app_settings SET value = ? WHERE key = 'activation_fee_cents' AND value = '50000'`)
    .run(String(config.activationFeeCents));

  await ensureDailyVideo(todayKey(), { notify: false });
  await ensureDailyProduct(todayKey(), { notify: false });
}

async function notifyActiveUsers(title, body) {
  const users = await db.prepare("SELECT id FROM users WHERE role = 'user' AND status = 'active'").all();
  if (!users.length) return;
  const insert = db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)');
  await db.transaction(() => {
    for (const user of users) insert.run(user.id, title, body, now());
  })();
  import('./services/push.js')
    .then(({ pushToUser }) => {
      for (const user of users) pushToUser(user.id, title, body, '/app').catch(() => {});
    })
    .catch(() => {});
}

export async function ensureDailyVideo(day, { notify = true } = {}) {
  const existing = await db.prepare('SELECT * FROM daily_videos WHERE day = ?').get(day);
  if (existing) return existing;
  const all = await db.prepare('SELECT id, title FROM videos WHERE active = 1 ORDER BY id').all();
  if (!all.length) return null;
  const dayNumber = Math.floor(new Date(day).getTime() / 86_400_000);
  const video = all[dayNumber % all.length];
  await db.prepare('INSERT OR IGNORE INTO daily_videos (day, video_id, created_at) VALUES (?, ?, ?)').run(day, video.id, now());
  if (notify) {
    notifyActiveUsers('New video task posted', `Today’s video “${video.title}” is ready. Watch it in full to earn.`);
  }
  return await db.prepare('SELECT * FROM daily_videos WHERE day = ?').get(day);
}

export async function ensureDailyProduct(day, { notify = true } = {}) {
  const existing = await db.prepare('SELECT * FROM daily_products WHERE day = ?').get(day);
  if (existing) return existing;
  const all = await db.prepare('SELECT id, name FROM products WHERE active = 1 ORDER BY id').all();
  if (!all.length) return null;
  const dayNumber = Math.floor(new Date(day).getTime() / 86_400_000);
  const product = all[dayNumber % all.length];
  await db.prepare('INSERT OR IGNORE INTO daily_products (day, product_id, created_at) VALUES (?, ?, ?)').run(day, product.id, now());
  if (notify) {
    await notifyActiveUsers('New status task posted', `Today’s product “${product.name}” is live. Share it on WhatsApp status and submit your views.`);
  }
  return await db.prepare('SELECT * FROM daily_products WHERE day = ?').get(day);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedStatic();
  console.log('[seed] done');
}
