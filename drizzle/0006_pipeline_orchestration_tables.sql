ALTER TABLE `tasks` ADD COLUMN `pipeline_state` text DEFAULT 'NONE' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `current_stage` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `blocked_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `blob_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `stage_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `duration_seconds` real;
--> statement-breakpoint
CREATE TABLE `pipeline_stages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `task_id` integer NOT NULL REFERENCES `tasks`(`id`),
  `stage_key` text NOT NULL,
  `room` text DEFAULT '' NOT NULL,
  `assignee` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'PENDING' NOT NULL,
  `retries` integer DEFAULT 0 NOT NULL,
  `forced` integer DEFAULT 0 NOT NULL,
  `output_product_id` integer,
  `last_qc_product_id` integer DEFAULT 0 NOT NULL,
  `qc_note` text DEFAULT '' NOT NULL,
  `params` text DEFAULT '' NOT NULL,
  `started_at` integer,
  `finished_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stage_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `task_id` integer NOT NULL REFERENCES `tasks`(`id`),
  `stage_key` text DEFAULT '' NOT NULL,
  `actor` text DEFAULT '' NOT NULL,
  `summary` text DEFAULT '' NOT NULL,
  `product_id` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text DEFAULT '' NOT NULL
);
