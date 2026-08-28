-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_finish_idx" ON "Product" USING GIN ("finish" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_material_idx" ON "Product" USING GIN ("material" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_size_idx" ON "Product" USING GIN ("size" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier" USING GIN ("name" gin_trgm_ops);
