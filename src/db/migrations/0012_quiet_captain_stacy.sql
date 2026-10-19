CREATE TABLE `supplement_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`supplement_id` integer NOT NULL,
	`amount` text,
	`logged_at` text NOT NULL,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `supplements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`default_amount` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
