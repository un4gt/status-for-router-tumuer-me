CREATE TABLE checks (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	target TEXT NOT NULL,
	model TEXT,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
);

CREATE TABLE results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	check_id TEXT NOT NULL REFERENCES checks(id),
	ts INTEGER NOT NULL,
	success INTEGER NOT NULL,
	status_code INTEGER,
	latency_ms INTEGER,
	error TEXT
);

CREATE INDEX idx_results_check_ts ON results(check_id, ts);
CREATE INDEX idx_results_ts ON results(ts);

CREATE TABLE meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
