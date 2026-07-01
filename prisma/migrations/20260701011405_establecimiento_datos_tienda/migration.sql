-- AlterTable
ALTER TABLE "establecimiento" ADD COLUMN     "codigoPostal" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "localidad" TEXT,
ADD COLUMN     "provincia" TEXT,
ADD COLUMN     "raw" JSONB,
ADD COLUMN     "telefono" TEXT;
