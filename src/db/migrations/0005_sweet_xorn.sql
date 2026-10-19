ALTER TABLE `daily_checkins` ADD `weight_kg` real;--> statement-breakpoint
ALTER TABLE `foods` ADD `portions` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `protein_goal` integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `carbs_goal` integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `fat_goal` integer DEFAULT 65 NOT NULL;