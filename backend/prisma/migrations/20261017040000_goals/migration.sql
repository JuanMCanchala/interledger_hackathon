-- Goals the shop sets for itself: a monthly sales goal and a target for each savings rule.

ALTER TABLE "merchants" ADD COLUMN "monthly_sales_goal" BIGINT;

ALTER TABLE "rules" ADD COLUMN "savings_goal" BIGINT;
