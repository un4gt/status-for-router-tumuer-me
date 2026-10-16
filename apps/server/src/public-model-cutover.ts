/** Explicit offline migration; never runs during normal server startup. */
import { Database } from 'bun:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { CheckRow } from './db';

const [action, database, mappingFile, backupFile] = process.argv.slice(2);
if (!['preview', 'apply', 'rollback'].includes(action ?? '') || !database || (action !== 'rollback' && !mappingFile)) {
  throw new Error('Usage: bun apps/server/src/public-model-cutover.ts preview|apply database mapping.json [backup.sqlite] OR rollback database');
}
if (!existsSync(database)) throw new Error('Database must already exist');
const db = new Database(resolve(database), { readonly: action === 'preview', strict: true });
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const key = 'public-model-cutover-v1';
const checks = () => db.query<CheckRow, []>('SELECT * FROM checks ORDER BY id').all();
type Journal = { before: CheckRow[]; after: CheckRow[]; rolledBack?: boolean };
const readJournal = () => {
  const row = db.query<{ value: string }, [string]>('SELECT value FROM meta WHERE key=?').get(key);
  return row ? JSON.parse(row.value) as Journal : null;
};
try {
  if (action === 'rollback') {
    db.transaction(() => {
      const journal = readJournal();
      if (!journal || journal.rolledBack) throw new Error('No applied cutover to roll back');
      if (JSON.stringify(checks()) !== JSON.stringify(journal.after)) throw new Error('Check configuration changed; refusing rollback');
      for (const row of journal.before) {
        db.query('INSERT INTO checks VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,target=excluded.target,model=excluded.model,enabled=excluded.enabled,created_at=excluded.created_at')
          .run(row.id, row.type, row.target, row.model, row.enabled, row.created_at);
      }
      db.exec('UPDATE results SET check_id=(SELECT check_id FROM public_model_result_origins o WHERE o.id=results.id) WHERE id IN (SELECT id FROM public_model_result_origins)');
      const original = new Set(journal.before.map(c => c.id));
      for (const row of journal.after.filter(c => !original.has(c.id))) {
        // Keep post-cutover observations under their actual identity, disabled.
        db.query('UPDATE checks SET enabled=0 WHERE id=?').run(row.id);
        db.query('DELETE FROM checks WHERE id=? AND NOT EXISTS (SELECT 1 FROM results WHERE check_id=?)').run(row.id, row.id);
      }
      journal.rolledBack = true;
      db.query('UPDATE meta SET value=? WHERE key=?').run(JSON.stringify(journal), key);
    }).immediate();
    console.log('Rolled back check identities; all observations preserved.');
  } else {
    const { models } = JSON.parse(readFileSync(mappingFile!, 'utf8')) as { models: Record<string, string> };
    if (!models || Object.entries(models).some(([from, to]) => !from || typeof to !== 'string' || !to.includes('/'))) throw new Error('Invalid explicit model mapping');
    const before = checks();
    const moves = before.filter(c => c.model && models[c.model] && models[c.model] !== c.model).map(c => ({ source: c, target: `${c.type}:${models[c.model!]}`, model: models[c.model!]! }));
    console.log(JSON.stringify(moves.map(m => ({ from: m.source.id, to: m.target, enabled: m.source.enabled })), null, 2));
    if (action === 'apply') {
      if (readJournal()) throw new Error('Cutover journal already exists; review it before a new migration');
      if (!backupFile || existsSync(backupFile)) throw new Error('Apply requires a new backup.sqlite path');
      // Stop the scheduler/server before this offline operation.
      mkdirSync(dirname(resolve(backupFile)), { recursive: true });
      db.query('VACUUM INTO ?').run(resolve(backupFile));
      db.transaction(() => {
        if (JSON.stringify(checks()) !== JSON.stringify(before)) throw new Error('Configuration changed during backup');
        db.exec('CREATE TABLE public_model_result_origins (id INTEGER PRIMARY KEY, check_id TEXT NOT NULL)');
        for (const move of moves) {
          if (moves.some(m => m.source.id === move.target)) throw new Error('Chained/cyclic check mappings are not supported');
          const oldTarget = before.find(c => c.id === move.target);
          const sources = moves.filter(m => m.target === move.target).map(m => m.source);
          if (sources.some(c => c.target !== move.source.target) || (oldTarget && oldTarget.target !== move.source.target)) throw new Error('Cannot merge different gateway targets');
          const enabled = oldTarget?.enabled ?? Number(sources.some(c => c.enabled));
          db.query('INSERT INTO checks (id,type,target,model,enabled,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
            .run(move.target, move.source.type, move.source.target, move.model, enabled, Math.min(...sources.map(c => c.created_at)));
          db.query('INSERT INTO public_model_result_origins SELECT id,check_id FROM results WHERE check_id=?').run(move.source.id);
          db.query('UPDATE results SET check_id=? WHERE check_id=?').run(move.target, move.source.id);
          db.query('DELETE FROM checks WHERE id=?').run(move.source.id);
        }
        db.query('INSERT INTO meta(key,value) VALUES(?,?)').run(key, JSON.stringify({ before, after: checks() } satisfies Journal));
      }).immediate();
      console.log('Applied; check histories merged without deleting results.');
    }
  }
} finally { db.close(); }
