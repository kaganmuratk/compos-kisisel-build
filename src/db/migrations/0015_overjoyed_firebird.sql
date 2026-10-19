CREATE TABLE `coffee_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `daily_drink_card` text DEFAULT 'water' NOT NULL;