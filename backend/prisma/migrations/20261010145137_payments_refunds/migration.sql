-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refunded_at" TIMESTAMP(3);

-- A free order (100% discount) has an amount of 0, so the rule becomes "not negative"
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_check";
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);

-- Cash: received must cover the amount and change = received - amount. Other methods: no change.
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_change_check" CHECK (
  ("amount_received" IS NULL AND "change_given" = 0)
  OR ("amount_received" IS NOT NULL
      AND "amount_received" >= "amount"
      AND "change_given" = "amount_received" - "amount")
);
