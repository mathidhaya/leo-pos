/*
  Warnings:

  - A unique constraint covering the columns `[idempotency_key]` on the table `inventory_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_idempotency_key_key" ON "inventory_transactions"("idempotency_key");

-- A stock movement always changes the stock, and its direction must match its type
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_tx_change_check" CHECK (
  "quantity_change" <> 0
  AND (
    ("type" = 'IN' AND "quantity_change" > 0)
    OR ("type" IN ('OUT', 'SALE') AND "quantity_change" < 0)
    OR "type" = 'ADJUST'
  )
);
