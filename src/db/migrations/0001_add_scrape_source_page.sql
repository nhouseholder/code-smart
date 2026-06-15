--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE scrape_runs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  source_page_id INTEGER REFERENCES provider_source_pages(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  content_hash TEXT,
  change_detected INTEGER
);
--> statement-breakpoint
INSERT INTO scrape_runs_new SELECT id, provider_id, NULL, started_at, finished_at, status, error_message, content_hash, change_detected FROM scrape_runs;
--> statement-breakpoint
DROP TABLE scrape_runs;
--> statement-breakpoint
ALTER TABLE scrape_runs_new RENAME TO scrape_runs;
--> statement-breakpoint
CREATE INDEX idx_scrape_runs_provider ON scrape_runs(provider_id, started_at);
--> statement-breakpoint
CREATE INDEX idx_scrape_runs_source_page ON scrape_runs(source_page_id);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
