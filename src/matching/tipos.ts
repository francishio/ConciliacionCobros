import type { Cobro, Transaccion } from '@prisma/client'

// El matcher no usa el payload `raw` (jsonb pesado). Se omite en la lectura para
// no transferir miles de objetos jsonb por la red (era el cuello de botella de
// performance). Tipos "livianos" = la fila sin `raw`.
export type CobroMatch = Omit<Cobro, 'raw'>
export type TransaccionMatch = Omit<Transaccion, 'raw'>
