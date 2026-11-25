-- SSO embebido en HIOFFICE: mapeo empresa de HIOFFICE (companyId) -> cliente (tenant).
-- Aditiva: columna opcional + índice único (Postgres permite múltiples NULL en un
-- índice único, así que los clientes sin mapear conviven sin problema).
ALTER TABLE "tenant" ADD COLUMN "hiofficeCompanyId" TEXT;
CREATE UNIQUE INDEX "tenant_hiofficeCompanyId_key" ON "tenant"("hiofficeCompanyId");
