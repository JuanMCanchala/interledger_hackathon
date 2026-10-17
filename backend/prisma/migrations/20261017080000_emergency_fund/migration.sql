-- The emergency fund as a last resort: a second grant, on a savings wallet (ADR 0016).

ALTER TABLE "merchants" ADD COLUMN "emergency_mandate_id" UUID,
ADD COLUMN "emergency_rule_id" UUID;
