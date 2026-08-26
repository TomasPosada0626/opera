-- AlterEnum
BEGIN;
CREATE TYPE "ProductionOrderStatus_new" AS ENUM ('PENDIENTE', 'COMPLETADA', 'CANCELADA');
ALTER TABLE "public"."ProductionOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProductionOrder" ALTER COLUMN "status" TYPE "ProductionOrderStatus_new" USING ("status"::text::"ProductionOrderStatus_new");
ALTER TYPE "ProductionOrderStatus" RENAME TO "ProductionOrderStatus_old";
ALTER TYPE "ProductionOrderStatus_new" RENAME TO "ProductionOrderStatus";
DROP TYPE "public"."ProductionOrderStatus_old";
ALTER TABLE "ProductionOrder" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
COMMIT;
