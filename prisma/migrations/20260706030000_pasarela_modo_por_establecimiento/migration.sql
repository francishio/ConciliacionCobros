-- La config de pasarela pasa a nivel ESTABLECIMIENTO: se elimina la config a
-- nivel cliente (tenant_pasarela) y se agrega `modo` (archivo/API) al mapeo por
-- establecimiento. El enum ModoIngesta ya existe (se reutiliza).

DROP TABLE "tenant_pasarela";

ALTER TABLE "mapeo_establecimiento_pasarela"
  ADD COLUMN "modo" "ModoIngesta" NOT NULL DEFAULT 'MANUAL';
