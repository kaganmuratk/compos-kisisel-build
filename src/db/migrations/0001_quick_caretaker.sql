CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unit` text DEFAULT 'kg' NOT NULL,
	`rep_metric` text DEFAULT 'rir' NOT NULL,
	`water_goal_ml` integer DEFAULT 2500 NOT NULL
);
