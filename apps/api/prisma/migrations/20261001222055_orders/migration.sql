-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'COMPRA',
    "status" TEXT NOT NULL DEFAULT 'CREADA',
    "clienteId" TEXT NOT NULL,
    "conductorId" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "notes" TEXT,
    "deliveryFeeCents" INTEGER NOT NULL,
    "estimatedItemsCents" INTEGER NOT NULL DEFAULT 0,
    "finalItemsCents" INTEGER,
    "heldCents" INTEGER NOT NULL DEFAULT 0,
    "pendingExtraCents" INTEGER NOT NULL DEFAULT 0,
    "escrowGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "Order_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "estUnitCents" INTEGER NOT NULL,
    "realUnitCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_clienteId_idx" ON "Order"("clienteId");

-- CreateIndex
CREATE INDEX "Order_conductorId_idx" ON "Order"("conductorId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ChatMessage_orderId_idx" ON "ChatMessage"("orderId");
