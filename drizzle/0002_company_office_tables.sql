DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT 'video',
  assignee TEXT NOT NULL DEFAULT 'dao-dien',
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  scene_seconds REAL,
  total_seconds REAL,
  character_lock TEXT NOT NULL DEFAULT '',
  reference_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE qc_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  stage TEXT NOT NULL DEFAULT 'first_frame',
  verdict TEXT NOT NULL,
  check_face INTEGER NOT NULL DEFAULT 0,
  check_motion INTEGER NOT NULL DEFAULT 0,
  check_text INTEGER NOT NULL DEFAULT 0,
  check_ratio INTEGER NOT NULL DEFAULT 0,
  check_character INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id),
  room TEXT NOT NULL DEFAULT 'video',
  owner TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL DEFAULT 'company',
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cell_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
