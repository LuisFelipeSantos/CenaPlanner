CREATE TABLE `notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`due_date` text NOT NULL,
	`offset_days` integer NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`sent_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_event` ON `notification_jobs` (`entry_id`,`due_date`,`offset_days`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_notification_user` ON `notification_jobs` (`user_id`,`channel`,`read_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_queue` ON `notification_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`in_app` integer DEFAULT 1 NOT NULL,
	`email_enabled` integer DEFAULT 0 NOT NULL,
	`whatsapp_enabled` integer DEFAULT 0 NOT NULL,
	`phone` text,
	`phone_confirmed_at` text
);
--> statement-breakpoint
CREATE TABLE `recurrence_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`effective_period` text NOT NULL,
	`amount_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recurrence_value` ON `recurrence_values` (`user_id`,`template_id`,`effective_period`);--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `due_date` text;--> statement-breakpoint
CREATE INDEX `idx_ledger_due_status` ON `ledger_entries` (`due_date`,`status`);--> statement-breakpoint
ALTER TABLE `recurrence_templates` ADD `repetition_count` integer;--> statement-breakpoint
ALTER TABLE `recurrence_templates` ADD `notification_due_day` integer;--> statement-breakpoint
ALTER TABLE `recurrence_templates` ADD `due_month_offset` integer DEFAULT 0 NOT NULL;