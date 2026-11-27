import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

export async function migrate() {
  for (const statement of SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await db.exec(statement);
  }
}
