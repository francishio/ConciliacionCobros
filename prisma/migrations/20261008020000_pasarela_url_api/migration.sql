-- Catálogo de pasarelas: ABM simple (nombre + URL de API). Se quitan los campos
-- "activo" y "tipoIngesta" (ya no se usan); se agrega la URL base de la API.
ALTER TABLE "pasarela" ADD COLUMN "urlApi" TEXT;

-- Semilla: base URL de Clover para Argentina (lo que estaba hardcodeado).
UPDATE "pasarela" SET "urlApi" = 'https://api.la.clover.com' WHERE "codigo" = 'CLOVER';

ALTER TABLE "pasarela" DROP COLUMN "tipoIngesta";
ALTER TABLE "pasarela" DROP COLUMN "activo";
