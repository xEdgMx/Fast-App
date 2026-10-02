-- AlterTable
ALTER TABLE "Order" ADD COLUMN "destLat" REAL;
ALTER TABLE "Order" ADD COLUMN "destLng" REAL;
ALTER TABLE "Order" ADD COLUMN "distanceKm" REAL;
ALTER TABLE "Order" ADD COLUMN "originAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "originLat" REAL;
ALTER TABLE "Order" ADD COLUMN "originLng" REAL;
