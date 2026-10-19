ALTER TABLE `settings` ADD `media_cloud_backup` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `workout_session_media` ADD `cloud_path` text;
