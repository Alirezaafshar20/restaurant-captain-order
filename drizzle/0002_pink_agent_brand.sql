CREATE TABLE `dish_knowledge` (
	`key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dish_knowledge_owner` ON `dish_knowledge` (`owner`);--> statement-breakpoint
CREATE TABLE `taste_decisions` (
	`key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_taste_decisions_owner_created` ON `taste_decisions` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `taste_feedback` (
	`key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_taste_feedback_owner` ON `taste_feedback` (`owner`);--> statement-breakpoint
CREATE TABLE `taste_profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL
);
