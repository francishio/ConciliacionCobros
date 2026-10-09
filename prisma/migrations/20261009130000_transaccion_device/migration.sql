-- device.id del dispositivo físico de la pasarela (Clover), para atribuir cada
-- transacción a la tienda/terminal de HIOPOS según el mapeo de dispositivos.
ALTER TABLE "transaccion" ADD COLUMN "deviceId" TEXT;
