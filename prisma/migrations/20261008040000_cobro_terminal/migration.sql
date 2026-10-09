-- Terminal (Cód. Terminal + Alias) de cada venta HIOPOS, para armar el catálogo
-- de terminales por tienda y poder acotar la conciliación por terminal.
ALTER TABLE "cobro" ADD COLUMN "codTerminal" TEXT;
ALTER TABLE "cobro" ADD COLUMN "aliasTerminal" TEXT;
