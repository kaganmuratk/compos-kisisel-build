CREATE TABLE `run_routes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`points` text NOT NULL,
	`distance_meters` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `cardio_sessions` ADD `name` text;--> statement-breakpoint
ALTER TABLE `cardio_sessions` ADD `planned_route_id` integer REFERENCES run_routes(id);--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `name` text;