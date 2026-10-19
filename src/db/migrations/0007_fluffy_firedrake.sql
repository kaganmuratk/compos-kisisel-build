CREATE TABLE `day_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_notes_date_unique` ON `day_notes` (`date`);