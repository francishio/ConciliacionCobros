-- RLS faltante en mapeo_medio_pago.
-- La tabla se creó con `prisma migrate dev`, que NO agrega la política RLS (solo
-- el grant, vía ALTER DEFAULT PRIVILEGES de la migración enable_rls). Sin esta
-- política, app_runtime veía filas de todos los tenants. Aislamiento por tenant:
ALTER TABLE "mapeo_medio_pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "mapeo_medio_pago"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
