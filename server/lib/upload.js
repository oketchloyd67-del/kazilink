import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) || path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const uploadEvidence = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      const err = new Error('Upload a JPG, PNG or WebP screenshot.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
}).single('evidence');
