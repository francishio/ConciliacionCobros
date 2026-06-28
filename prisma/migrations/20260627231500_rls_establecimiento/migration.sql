-- RLS para establecimiento (migrate dev no agrega la política, solo el grant).
-- Aislamiento por tenant, igual que el resto de las tablas.
ALTER TABLE "establecimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "establecimiento"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
