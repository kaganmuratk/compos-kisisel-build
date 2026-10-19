CREATE TABLE `nutrition_goal_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`calorie_goal` integer NOT NULL,
	`protein_goal` integer NOT NULL,
	`carbs_goal` integer NOT NULL,
	`fat_goal` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_goal_snapshots_date_unique` ON `nutrition_goal_snapshots` (`date`);