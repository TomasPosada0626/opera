-- CreateTable
CREATE TABLE "Remission" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemissionItem" (
    "id" TEXT NOT NULL,
    "remissionId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Remission_number_key" ON "Remission"("number");

-- CreateIndex
CREATE INDEX "Remission_orderId_idx" ON "Remission"("orderId");

-- CreateIndex
CREATE INDEX "RemissionItem_remissionId_idx" ON "RemissionItem"("remissionId");

-- CreateIndex
CREATE INDEX "RemissionItem_orderItemId_idx" ON "RemissionItem"("orderItemId");

-- AddForeignKey
ALTER TABLE "Remission" ADD CONSTRAINT "Remission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remission" ADD CONSTRAINT "Remission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemissionItem" ADD CONSTRAINT "RemissionItem_remissionId_fkey" FOREIGN KEY ("remissionId") REFERENCES "Remission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemissionItem" ADD CONSTRAINT "RemissionItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
