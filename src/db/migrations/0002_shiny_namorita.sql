CREATE TABLE `cardio_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	`distance_meters` real,
	`duration_seconds` integer,
	`route` text,
	`notes` text
);
