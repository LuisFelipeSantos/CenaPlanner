ALTER TABLE `categories` ADD `normalized_key` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_category_user_key` ON `categories` (`user_id`,`normalized_key`);--> statement-breakpoint
ALTER TABLE `notification_preferences` DROP COLUMN `whatsapp_enabled`;--> statement-breakpoint
ALTER TABLE `notification_preferences` DROP COLUMN `phone`;--> statement-breakpoint
ALTER TABLE `notification_preferences` DROP COLUMN `phone_confirmed_at`;