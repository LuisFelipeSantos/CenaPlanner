CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_category_user_name` ON `categories` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `financial_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_salary_cents` integer NOT NULL,
	`initial_period` text NOT NULL,
	`onboarding_completed_at` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`entry_date` text NOT NULL,
	`source_key` text NOT NULL,
	`template_id` text,
	`deleted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ledger_occurrence` ON `ledger_entries` (`user_id`,`period`,`source_key`);--> statement-breakpoint
CREATE INDEX `idx_ledger_user_date` ON `ledger_entries` (`user_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_user_template_period` ON `ledger_entries` (`user_id`,`template_id`,`period`);--> statement-breakpoint
CREATE TABLE `monthly_cycles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`initial_salary_cents` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cycle_user_period` ON `monthly_cycles` (`user_id`,`period`);--> statement-breakpoint
CREATE TABLE `recurrence_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`start_period` text NOT NULL,
	`end_date` text,
	`interval_months` integer DEFAULT 1 NOT NULL,
	`due_day` integer NOT NULL,
	`stopped_from` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_templates_user_start` ON `recurrence_templates` (`user_id`,`start_period`);--> statement-breakpoint
CREATE TABLE `salary_defaults` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`effective_period` text NOT NULL,
	`amount_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_salary_default_period` ON `salary_defaults` (`user_id`,`effective_period`);