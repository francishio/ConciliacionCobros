-- CreateTable
CREATE TABLE "mapeo_medio_pago" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medioPago" TEXT NOT NULL,
    "proveedor" "Proveedor",
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mapeo_medio_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mapeo_medio_pago_tenantId_medioPago_key" ON "mapeo_medio_pago"("tenantId", "medioPago");

-- AddForeignKey
ALTER TABLE "mapeo_medio_pago" ADD CONSTRAINT "mapeo_medio_pago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
