-- ============================================================
-- RLS multi-tenant — ConciliacionCobros
-- ------------------------------------------------------------
-- Aislamiento por tenant vía current_setting('app.current_tenant').
-- El rol de runtime (app_runtime) NO es dueño de las tablas, por lo que
-- las políticas RLS se le aplican. neondb_owner (migraciones / control
-- plane) es dueño y BYPASSA RLS por diseño.
--
-- Nota: "id" y "tenantId" son TEXT (uuid como string), así que se comparan
-- como texto, sin cast a ::uuid. Si la variable de sesión no está seteada,
-- current_setting(..., true) devuelve NULL → ninguna fila matchea
-- (fail-closed).
-- ============================================================

-- 1. Rol de runtime (sin login; el password se setea por entorno, fuera del repo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END
$$;

-- 2. Permisos de datos (sin DDL) sobre las tablas de dominio.
GRANT USAGE ON SCHEMA public TO app_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "tenant",
  "matching_profile",
  "cobro",
  "transaccion",
  "liquidacion",
  "liquidacion_linea",
  "retencion",
  "match",
  "excepcion"
TO app_runtime;

-- Tablas futuras creadas por el owner: mismos permisos por defecto.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- 3. Habilitar RLS + política de aislamiento por tenant en cada tabla.

ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "tenant"
  USING ("id" = current_setting('app.current_tenant', true))
  WITH CHECK ("id" = current_setting('app.current_tenant', true));

ALTER TABLE "matching_profile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "matching_profile"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "cobro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "cobro"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "transaccion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "transaccion"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "liquidacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "liquidacion"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "liquidacion_linea" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "liquidacion_linea"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "retencion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "retencion"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "match" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "match"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "excepcion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "excepcion"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
