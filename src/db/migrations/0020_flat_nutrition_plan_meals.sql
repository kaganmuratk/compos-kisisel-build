ALTER TABLE `nutrition_plan_meals` ADD `plan_id` integer REFERENCES nutrition_plans(id);--> statement-breakpoint
UPDATE `nutrition_plan_meals` SET `plan_id` = (SELECT `plan_id` FROM `nutrition_plan_days` WHERE `id` = `nutrition_plan_meals`.`plan_day_id`);--> statement-breakpoint
DROP TABLE `nutrition_plan_days`;
