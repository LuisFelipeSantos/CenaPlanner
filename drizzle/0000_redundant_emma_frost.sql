CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Outros' NOT NULL,
	`amount` real NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`due_day` integer,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`recurring` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
