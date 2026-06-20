# Modelo de Datos Canónico — Conciliación HIOPOS

**Versión:** 1.0
**Fecha:** 2026-06-20
**Estado:** Diseño inicial (próximo paso: `schema.prisma`)

---

## 1. Idea central

Las **dos conciliaciones son dos tablas de unión distintas**, y los dos campos de
estado que se escriben en HIOPOS son una *proyección* derivada de esas uniones:

- `Cobro` ↔ `Transaccion` → **conciliación operativa** (tabla `Match`)
- `Transaccion` ↔ `LiquidacionLinea` → **conciliación financiera**

El estado guardado en HIOPOS es el semáforo que resume en qué punto de esas dos
cadenas está cada cobro.

---

## 2. Entidades

### Tenant
Cliente (restaurante). Ancla de aislamiento multi-tenant.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | string | |
| ... | | config de credenciales referenciada aparte (vault) |

### MatchingProfile
Configuración de matching por cliente.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| determ_disponible | bool | ¿existe clave determinística? |
| ventana_min | int | tolerancia temporal para fuzzy (min) |
| tol_monto | decimal | tolerancia de monto |

### Cobro
Línea de cobro registrada en HIOPOS (el ingreso "esperado").

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| hiopos_ticket_id | string | referencia del ticket/documento |
| medio_pago | string | Visa, Master, MP QR, efectivo, etc. |
| importe | decimal | |
| cuotas | int | |
| fecha_hora | timestamp | |
| cod_autorizacion | string | clave determinística (si integrado) |
| ultimos4 | string | para matching fuzzy |
| estado_op | enum | proyección — ver §4 |
| estado_fin | enum | proyección — ver §4 |

### Transaccion
Transacción autorizada en el procesador (MP payment / operación Payway).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| proveedor | string | mercadopago / payway |
| id_externo | string | MP payment_id / Payway TID |
| importe_bruto | decimal | |
| cuotas | int | |
| external_reference | string | ticket HIOPOS estampado (MP) |
| estado | enum | aprobada / anulada / devuelta / contracargo |
| raw | jsonb | payload crudo del proveedor (auditoría) |

### Liquidacion
Cabecera del evento de liquidación (acreditación neta).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| proveedor | string | |
| fecha_acreditacion | date | |
| neto_total | decimal | |

### LiquidacionLinea
Detalle de liquidación **a nivel cuota**. Es lo que matchea contra `Transaccion`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| liquidacion_id | uuid | FK |
| transaccion_id | uuid | FK |
| nro_cuota | int | |
| bruto | decimal | |
| arancel | decimal | |
| retenciones | decimal | (ver decisión abierta: desglosar por tipo) |
| neto | decimal | |
| tipo_mov | string | acreditacion / contracargo / devolucion / ajuste |

### Match
Unión operativa entre `Cobro` y `Transaccion`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| cobro_id | uuid | FK |
| transaccion_id | uuid | FK |
| tipo | string | deterministico / fuzzy |
| score | float | para fuzzy |
| estado | enum | auto / confirmado_manual / descartado |

### Excepcion
Break detectado (algo que no matchea o tiene diferencia).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| tipo | string | cobro_sin_transaccion, transaccion_sin_cobro, diferencia_monto, comision_inesperada, retencion_no_esperada, contracargo, cuota_no_acreditada, fuzzy_ambiguo |
| estado | enum | abierta / en_revision / resuelta / ignorada |
| nota | string | |

---

## 3. Decisiones de diseño

- **`LiquidacionLinea` a nivel cuota, no a nivel transacción.** Es lo que permite
  modelar cuotas y acreditaciones diferidas. Una venta en 3 cuotas = 1
  `Transaccion` + 3 `LiquidacionLinea` en fechas distintas. Por eso existe el
  estado `PARCIAL`. El `tipo_mov` permite modelar un contracargo como línea
  negativa que referencia la misma transacción (enlazable por el TID de Payway).

- **`Match` es tabla separada, no un FK en `Cobro`.** Permite guardar `tipo`,
  `score` y `estado` del match, y conservar la trazabilidad de candidatos
  descartados (clave para el caso fuzzy). En determinístico es casi siempre 1:1,
  pero la tabla soporta splits y ambiguos sin cambiar el esquema.

- **`raw jsonb` + idempotencia.** Se guarda el payload crudo del proveedor; nunca
  se tira el dato de origen. La ingesta es idempotente: `id_externo` único por
  `(tenant_id, proveedor)` → reprocesar un reporte hace upsert, no duplica.

- **`tenant_id` en todo + RLS.** Aislamiento por Row-Level Security. Habilita el
  motor central con vista cruzada para soporte.

- **`estado_op` / `estado_fin` son proyección denormalizada.** Viven en `Cobro`
  porque son los dos campos que se escriben a HIOPOS y para query rápida, pero la
  verdad está en `Match` y `LiquidacionLinea`. Una función
  `recomputeEstado(cobro_id)` los recalcula cuando cambia cualquier unión, y ese
  cambio dispara el write-back best-effort a HIOPOS.

- **Efectivo y medios no procesables → `NO_APLICA`** y quedan fuera del pipeline.
  Solo tarjeta y MP se concilian.

---

## 4. Máquinas de estado

### estado_concil_operativa

| Desde | Hacia | Condición |
|---|---|---|
| (inicial) | PENDIENTE | cobro ingresado, sin matchear |
| PENDIENTE | OK | matcheó, monto dentro de tolerancia |
| PENDIENTE | DIFERENCIA_MONTO | matcheó, monto fuera de tolerancia |
| PENDIENTE | SIN_TRANSACCION | no se encontró transacción |
| PENDIENTE | EN_REVISION | fuzzy ambiguo (espera humano) |
| EN_REVISION | OK / DIFERENCIA_MONTO / SIN_TRANSACCION | resolución manual |
| SIN_TRANSACCION | OK | aparece una transacción tardía |
| (cualquiera) | NO_APLICA | medio no procesable (efectivo, etc.) |

### estado_concil_financiera
*(solo tiene sentido una vez que la operativa dio `OK`)*

| Desde | Hacia | Condición |
|---|---|---|
| (inicial) | PENDIENTE | transacción existe, sin liquidación |
| PENDIENTE | PARCIAL | algunas cuotas acreditadas, no todas |
| PARCIAL | ACREDITADO | acreditaron todas las cuotas esperadas |
| PENDIENTE | ACREDITADO | acreditación completa de una |
| (cualquiera) | DIFERENCIA | arancel/retención fuera de lo esperado |
| ACREDITADO | CONTRACARGO | contracargo posterior (de ahí la ventana móvil) |

---

## 5. Índices recomendados

Compuestos, orientados al matching:

- `(tenant_id, fecha_hora)`
- `(tenant_id, cod_autorizacion)` — match determinístico
- `(tenant_id, ultimos4, importe)` — match fuzzy
- `(tenant_id, proveedor, id_externo)` UNIQUE — idempotencia de ingesta

---

## 6. Próximo paso

Bajar este modelo a `schema.prisma` con enums, índices y políticas RLS, reutilizando
la versión/setup de Prisma ya probada en gastronomia-app.
