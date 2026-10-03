import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PROJECT_ROOT } from './config';

const source = resolve(PROJECT_ROOT, process.env.DATABASE_PATH || './data/status.sqlite');
const destination = process.argv[2];
if (!destination) throw new Error('Usage: bun run db:backup ./data/backups/status-YYYY-MM-DD.sqlite');
const target = resolve(PROJECT_ROOT, destination);
if (!existsSync(source)) throw new Error('Source database does not exist');
if (existsSync(target)) throw new Error('Backup destination already exists; choose a new filename');
mkdirSync(dirname(target), { recursive: true });
const db = new Database(source, { readonly: true });
try {
	db.exec('PRAGMA busy_timeout=5000');
	db.query('VACUUM INTO ?').run(target);
	console.log(`Backup saved to ${target}`);
} finally {
	db.close();
}
