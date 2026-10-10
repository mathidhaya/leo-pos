/*
  Warnings:

  - A unique constraint covering the columns `[shop_id,idempotency_key]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "walk_in_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_idempotency_key_key" ON "orders"("shop_id", "idempotency_key");
