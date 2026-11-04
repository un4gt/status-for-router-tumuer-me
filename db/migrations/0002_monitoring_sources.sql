ALTER TABLE checks ADD COLUMN provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE checks ADD COLUMN external_id TEXT;
ALTER TABLE results ADD COLUMN region_id TEXT NOT NULL DEFAULT '';
ALTER TABLE results ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
CREATE INDEX idx_results_check_source_region_ts ON results(check_id, source, region_id, ts);
CREATE INDEX idx_results_check_region_ts ON results(check_id, region_id, ts);
UPDATE checks SET enabled=0 WHERE id='head:router';
