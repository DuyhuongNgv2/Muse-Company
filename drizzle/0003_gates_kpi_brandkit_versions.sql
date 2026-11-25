ALTER TABLE tasks ADD COLUMN gate_brief TEXT NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN gate_frame TEXT NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN gate_final TEXT NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN version TEXT NOT NULL DEFAULT 'v1';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN return_reason TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN file_size INTEGER;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN file_md5 TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN publishable INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE staff_profiles (
  staff_id TEXT PRIMARY KEY,
  capability TEXT NOT NULL DEFAULT 'video',
  quota_used_pct REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE brand_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'outfit',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
