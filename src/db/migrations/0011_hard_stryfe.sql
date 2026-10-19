CREATE TABLE `workout_session_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_session_id` integer NOT NULL,
	`uri` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workout_session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `exercises` ADD `is_bodyweight` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `exercises` ADD `is_unilateral` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `side` text;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `media_uri` text;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `media_type` text;