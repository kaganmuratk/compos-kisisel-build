PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cardio_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`distance_meters` real,
	`duration_seconds` integer,
	`route` text,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_cardio_sessions`("id", "date", "started_at", "finished_at", "distance_meters", "duration_seconds", "route", "notes") SELECT "id", "date", "started_at", "finished_at", "distance_meters", "duration_seconds", "route", "notes" FROM `cardio_sessions`;--> statement-breakpoint
DROP TABLE `cardio_sessions`;--> statement-breakpoint
ALTER TABLE `__new_cardio_sessions` RENAME TO `cardio_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_daily_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`sleep_hours` real,
	`stress_level` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_daily_checkins`("id", "date", "sleep_hours", "stress_level", "created_at") SELECT "id", "date", "sleep_hours", "stress_level", "created_at" FROM `daily_checkins`;--> statement-breakpoint
DROP TABLE `daily_checkins`;--> statement-breakpoint
ALTER TABLE `__new_daily_checkins` RENAME TO `daily_checkins`;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_checkins_date_unique` ON `daily_checkins` (`date`);--> statement-breakpoint
CREATE TABLE `__new_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`image_uri` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_exercises`("id", "name", "category", "image_uri", "is_custom", "created_at") SELECT "id", "name", "category", "image_uri", "is_custom", "created_at" FROM `exercises`;--> statement-breakpoint
DROP TABLE `exercises`;--> statement-breakpoint
ALTER TABLE `__new_exercises` RENAME TO `exercises`;--> statement-breakpoint
CREATE TABLE `__new_foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`calories_per_100g` real NOT NULL,
	`protein_per_100g` real NOT NULL,
	`carbs_per_100g` real NOT NULL,
	`fat_per_100g` real NOT NULL,
	`fiber_per_100g` real,
	`barcode` text,
	`source` text DEFAULT 'custom' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_foods`("id", "name", "category", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "fiber_per_100g", "barcode", "source", "is_custom", "created_at") SELECT "id", "name", "category", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "fiber_per_100g", "barcode", "source", "is_custom", "created_at" FROM `foods`;--> statement-breakpoint
DROP TABLE `foods`;--> statement-breakpoint
ALTER TABLE `__new_foods` RENAME TO `foods`;--> statement-breakpoint
CREATE TABLE `__new_nutrition_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`food_id` integer NOT NULL,
	`meal_type` text NOT NULL,
	`amount_grams` real NOT NULL,
	`notes` text,
	`logged_at` text NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_logs`("id", "date", "food_id", "meal_type", "amount_grams", "notes", "logged_at") SELECT "id", "date", "food_id", "meal_type", "amount_grams", "notes", "logged_at" FROM `nutrition_logs`;--> statement-breakpoint
DROP TABLE `nutrition_logs`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_logs` RENAME TO `nutrition_logs`;--> statement-breakpoint
CREATE TABLE `__new_nutrition_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_plans`("id", "name", "created_at") SELECT "id", "name", "created_at" FROM `nutrition_plans`;--> statement-breakpoint
DROP TABLE `nutrition_plans`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_plans` RENAME TO `nutrition_plans`;--> statement-breakpoint
CREATE TABLE `__new_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_programs`("id", "name", "is_active", "created_at") SELECT "id", "name", "is_active", "created_at" FROM `programs`;--> statement-breakpoint
DROP TABLE `programs`;--> statement-breakpoint
ALTER TABLE `__new_programs` RENAME TO `programs`;--> statement-breakpoint
CREATE TABLE `__new_set_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_log_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`rir` real,
	`rpe` real,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exercise_log_id`) REFERENCES `exercise_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_set_logs`("id", "exercise_log_id", "set_number", "weight", "reps", "rir", "rpe", "notes", "created_at") SELECT "id", "exercise_log_id", "set_number", "weight", "reps", "rir", "rpe", "notes", "created_at" FROM `set_logs`;--> statement-breakpoint
DROP TABLE `set_logs`;--> statement-breakpoint
ALTER TABLE `__new_set_logs` RENAME TO `set_logs`;--> statement-breakpoint
CREATE TABLE `__new_water_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`amount_ml` integer NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_water_logs`("id", "date", "amount_ml", "logged_at") SELECT "id", "date", "amount_ml", "logged_at" FROM `water_logs`;--> statement-breakpoint
DROP TABLE `water_logs`;--> statement-breakpoint
ALTER TABLE `__new_water_logs` RENAME TO `water_logs`;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`program_day_id` integer,
	`started_at` text NOT NULL,
	`finished_at` text,
	`notes` text,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "date", "program_day_id", "started_at", "finished_at", "notes") SELECT "id", "date", "program_day_id", "started_at", "finished_at", "notes" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;