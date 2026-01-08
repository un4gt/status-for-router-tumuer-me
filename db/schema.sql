-- Status Page schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS checks (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL, -- 'head' | 'model'
	target TEXT NOT NULL,
	model TEXT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL -- unix ms
);

CREATE TABLE IF NOT EXISTS results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	check_id TEXT NOT NULL,
	ts INTEGER NOT NULL, -- unix ms
	success INTEGER NOT NULL, -- 0/1
	status_code INTEGER NULL,
	latency_ms INTEGER NULL,
	error TEXT NULL,
	FOREIGN KEY (check_id) REFERENCES checks (id)
);

CREATE INDEX IF NOT EXISTS idx_results_check_ts ON results (check_id, ts);
CREATE INDEX IF NOT EXISTS idx_results_ts ON results (ts);

CREATE TABLE IF NOT EXISTS meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
