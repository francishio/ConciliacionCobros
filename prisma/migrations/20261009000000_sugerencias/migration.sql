-- Sugerencias de los usuarios (control-plane; se accede por adminDb, scope por
-- usuarioId, sin RLS por tenant).
CREATE TYPE "EstadoSugerencia" AS ENUM ('NUEVO', 'ACEPTADO', 'RECHAZADO', 'IMPLEMENTADO');

CREATE TABLE "sugerencia" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "comentarioHio" TEXT,
    "estado" "EstadoSugerencia" NOT NULL DEFAULT 'NUEVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugerencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sugerencia_usuarioId_idx" ON "sugerencia"("usuarioId");

ALTER TABLE "sugerencia" ADD CONSTRAINT "sugerencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
