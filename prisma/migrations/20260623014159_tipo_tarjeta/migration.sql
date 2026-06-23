-- CreateEnum
CREATE TYPE "TipoTarjeta" AS ENUM ('CREDITO', 'DEBITO');

-- AlterTable
ALTER TABLE "cobro" ADD COLUMN     "tipoTarjeta" "TipoTarjeta";

-- AlterTable
ALTER TABLE "transaccion" ADD COLUMN     "tipoTarjeta" "TipoTarjeta";
