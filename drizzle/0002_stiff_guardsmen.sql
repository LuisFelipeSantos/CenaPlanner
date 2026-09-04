CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`monthly_salary` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
