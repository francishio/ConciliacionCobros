-- Catálogo de pasarelas (reemplaza el enum Proveedor por datos administrables).
-- Migración hand-written: Prisma no genera el cast enum→text automáticamente,
-- pero es seguro con USING "col"::text (los valores 'PAYWAY'/'MERCADOPAGO' se
-- conservan tal cual y quedan como el `codigo` del catálogo).

-- 1) Tabla de catálogo (global, sin tenant → no RLS; es dato de referencia)
CREATE TABLE "pasarela" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoIngesta" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 100,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasarela_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pasarela_codigo_key" ON "pasarela"("codigo");

-- 2) Semilla con las pasarelas que ya existían en el enum
INSERT INTO "pasarela" ("id", "codigo", "nombre", "tipoIngesta", "activo", "orden") VALUES
  (gen_random_uuid(), 'PAYWAY', 'Payway', 'ARCHIVO', true, 10),
  (gen_random_uuid(), 'MERCADOPAGO', 'Mercado Pago', 'API', true, 20);

-- 3) enum Proveedor → TEXT (conserva los valores actuales)
ALTER TABLE "mapeo_establecimiento_pasarela" ALTER COLUMN "proveedor" TYPE TEXT USING "proveedor"::text;
ALTER TABLE "transaccion" ALTER COLUMN "proveedor" TYPE TEXT USING "proveedor"::text;
ALTER TABLE "mapeo_medio_pago" ALTER COLUMN "proveedor" TYPE TEXT USING "proveedor"::text;
ALTER TABLE "liquidacion" ALTER COLUMN "proveedor" TYPE TEXT USING "proveedor"::text;

-- 4) Ya nadie usa el tipo → dropear
DROP TYPE "Proveedor";
