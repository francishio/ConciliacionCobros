# ConciliacionCobros — Contexto para Claude Code

Este archivo te da el contexto del proyecto. Leelo al inicio de cada sesión.

## Qué es

Solución para conciliar los cobros registrados en **HIOPOS** contra las plataformas
de cobro (**Mercado Pago** y **Payway**), escalable a múltiples clientes (multi-tenant).

La conciliación tiene **dos etapas encadenadas**:

1. **Operativa** — cobro de HIOPOS ↔ transacción autorizada en el procesador.
2. **Financiera** — transacción ↔ liquidación efectiva en el banco (aranceles,
   retenciones, cuotas diferidas, contracargos).

## Stack

- **PostgreSQL** en Neon (fuente de verdad)
- **Prisma** (ORM: schema + migraciones + cliente tipado)
- **Node.js + TypeScript**
- **Scheduler**: cron + cola (worker dedicado; NO funciones serverless con timeout corto)

Reutilizar la versión y el setup de Prisma ya probados en el proyecto `gastronomia-app`.

## Estructura del repo

```
docs/      → documentación de diseño (arquitectura y modelo de datos)
prisma/    → schema.prisma y migraciones
```

## Documentos de referencia (leer ANTES de proponer cambios)

- `docs/arquitectura-conciliacion-v1.md` — arquitectura en capas, multi-tenancy,
  ritmo, matching, presentación.
- `docs/modelo-datos-conciliacion-v1.md` — modelo canónico, entidades, máquinas de
  estado, índices.

Si una propuesta contradice estos documentos, marcalo explícitamente antes de avanzar;
no cambies la arquitectura sin alinearla primero.

## Cómo quiero que trabajes

- En **español rioplatense**, técnico y directo.
- **Alineá con la documentación antes de proponer cambios.**
- Ejemplos de código **completos**, no fragmentos sueltos.
- Preguntá si una decisión de diseño no está clara, en vez de asumir.

## Decisiones de arquitectura ya tomadas (no relitigar)

- **Neon es el sistema de registro.** HIOPOS es solo capa de presentación: se le hace
  write-back de dos campos de estado por cobro (`estadoOp`, `estadoFin`), best-effort
  e idempotente. El sistema funciona completo aunque ese write-back falle.
- **Matching mixto por cliente**: cascada determinístico → fuzzy, según el
  `MatchingProfile` del tenant. Nunca forzar un match fuzzy ambiguo: va a `Excepcion`.
- **Ritmo**: operativa en batch diario (post-cierre); financiera en ventana móvil
  60–90 días, re-disparada al llegar cada liquidación.
- **Retenciones**: tabla `Retencion` por tipo impositivo + total denormalizado en
  `LiquidacionLinea.retenciones`.
- **Procesadores soportados**: Mercado Pago (API), Payway (archivo) y **Fiserv/Clover**
  (API o archivo, configurable por tenant). Sumar uno = nuevo adaptador sobre
  `IngestaAdapter`; el motor no cambia.
- **Conciliación por proveedor / multi-pasarela**: la expo de HIOPOS trae todos los
  medios de pago juntos; `MapeoMedioPago` (por tenant) mapea cada medio → proveedor, o
  `null` = NO CONCILIABLE (ej. EFECTIVO → `NO_APLICA`). Cada pasarela es un cruce
  separado: `conciliarOperativa(tenant, proveedor)` solo procesa los cobros de ese medio
  y nunca matchea contra transacciones de otro proveedor. (A futuro HIOPOS podría traer
  un campo estandarizado de "grupo de conciliación" por medio.)
- **Acceso a datos por proveedor** (ver arquitectura §3): **Mercado Pago = API**
  (movimientos + liquidaciones; credencial = Access Token, multi-tenant vía OAuth).
  **Payway = SIN API de reportería** (su developer API es gateway de cobro); se baja de
  Mi Payway (Movimientos en Excel + Liquidaciones, parte en PDF) → ingesta por
  **archivo/upload**. HIOPOS = Bridge (export). Banco (Fase 2) = upload manual.
- **Conciliación financiera en 2 tramos**: tramo 1 = transacción ↔ settlement del
  procesador (Fase 1, en curso); tramo 2 = settlement ↔ extracto bancario (**Fase 2,
  diferida**: upload manual del extracto, match fuzzy a nivel pila, retenciones
  bancarias SIRCREB/IIBB). Ver `docs/arquitectura-conciliacion-v1.md` §11.
- **HIOPOS se integra vía Bridge Hioffice** (WebService de ICG), NO PortalRest (corrige
  arquitectura §4). Flujo: login (`cloudlicense.icg.eu/.../getCustomerWithAuthToken`) →
  POST `ErpCloud/exportation/launch` (devuelve docs en Base64: JSON/CSV) → logout. El
  `exportationId` va **numérico** (como string devuelve body vacío). El export
  "ARG - Conciliacion Cobros" trae los cobros en CSV `;`-delimitado, formato AR
  (`.`=miles, `,`=decimal). Es **intermitente** (a veces vuelve vacío) → `exportar()`
  reintenta re-logueando (el vacío depende del nodo/sesión). Cliente `bridge.ts` +
  normalizador `cobros.ts` (mapeo **por nombre de columna**, no posición: el export
  cambió de columnas) + `ingestarCobros` (idempotencia por `origenRef` = códDoc|línea|idAutorización).
  GARDINER usa **Clover SDK** como medio de pago (procesador = Clover/Fiserv).

## Restricciones técnicas críticas

- **RLS no lo maneja Prisma.** Las políticas de Row-Level Security van en una
  migración SQL aparte, sobre `tenant_id`. Toda query respeta el aislamiento por tenant.
  **⚠️ Cada tabla nueva con `tenantId` necesita su migración RLS A MANO** (`ENABLE ROW
  LEVEL SECURITY` + policy `USING ("tenantId" = current_setting('app.current_tenant', true))`).
  `prisma migrate dev` solo da el GRANT (vía ALTER DEFAULT PRIVILEGES), **no** la política.
- **Dos clientes Prisma:** `db` (rol `app_runtime`, RLS aplicada) para datos de un
  tenant, siempre vía `withTenant(tenantId, fn)` que setea `app.current_tenant` por
  transacción; `adminDb` (rol `neondb_owner`, bypassa RLS) SOLO para operaciones
  cross-tenant deliberadas (enumerar tenants, seed, mantenimiento). Nunca servir datos
  de un tenant con `adminDb`. `tenantId` está denormalizado en todas las tablas hijas.
- **Idempotencia de ingesta**: `@@unique([tenantId, proveedor, idExterno])` en
  `Transaccion`. Reprocesar un reporte hace upsert, nunca duplica.
- **`raw` (jsonb)**: se guarda siempre el payload crudo del proveedor. No descartar
  datos de origen.
- **`estadoOp` / `estadoFin` son proyección denormalizada**: la verdad está en `Match`
  y `LiquidacionLinea`. Recalcular con una función dedicada cuando cambia una unión, y
  ese cambio dispara el write-back a HIOPOS.

## Estado actual

- [x] Documentación de diseño
- [x] `prisma/schema.prisma` (modelo canónico v1)
- [x] Scaffolding (worker Node+TS, Prisma 5.22, Neon, `withTenant`/`adminDb`)
- [x] Migración inicial + políticas RLS (rol `app_runtime`, aislamiento por tenant verificado)
- [~] Adaptadores de ingesta: MP transacciones ✅ (API), Payway transacciones ✅ (xlsx real
  + carga en lotes `ingestarTransaccionesBulk`), HIOPOS cobros ✅ (Bridge). Falta: MP/Payway
  liquidaciones (financiera), Clover/Fiserv (esperando credenciales del cliente).
- [x] Motor de matching **operativo** ✅: determinístico (cód. autorización Clover/Payway +
  ticket MP) + **fuzzy** (importe+ventana+marca+ult4, narrowing progresivo) + máquina de
  estados + cola de excepciones (`src/matching/`). **Por proveedor** (`MapeoMedioPago`,
  multi-pasarela). **Batched** (lee→computa→escribe en lotes; escala validada: 1818 cobros
  en ~21s). Ventana en minutos debe ser **< 1440** para datos sin hora (= mismo día).
  Narrowing fuzzy: ultimos4 → marca → **crédito/débito** (`tipoTarjeta`), como desempate
  suave (no descarta el único candidato). **Validado con Rochino real: 78% auto-conciliable**
  (importe+día+tipo, sin auth/tarjeta), 13% revisión, 9% sin transacción. Falta: re-evaluar
  SIN_TRANSACCION/EN_REVISION (transacción tardía).
- [ ] Write-back de estados a HIOPOS
- [~] Web app (Next.js 14, app router): **flujo end-to-end MVP** ✅ — subir export HIOPOS
  + reporte Payway → conciliar → dashboard de métricas (`app/`). Falta: login (NextAuth),
  cola de excepciones, detalle por cobro, vault de credenciales.

**Scripts**: `npm run dev` = web app (Next) · `npm run worker` = worker (tsx) ·
`npm run build` = build web · `npm run typecheck`. El repo es Next.js + la lógica en `src/`.

### Pendientes / notas para retomar

**Estado (2026-06-23):** web app MVP (subir HIOPOS+Payway → conciliar → dashboard)
funcionando, validado con Rochino real (**78% auto-conciliable**). Motor batched +
optimizado (matcher ~16s; omite `raw` vía `omitApi`). RLS completo en todas las tablas.

**Plan acordado** (ver `docs/findings-payconcil.md`): adoptar ideas de PayConcil v2.0
(UX + DAF) sobre nuestra base. Confirmado: `Tenant` = empresa, `Establecimiento` debajo.

- **Multi-establecimiento — EN CURSO.** ✅ Entidad `Establecimiento` + `establecimientoId`
  en Cobro/Transaccion + RLS. Los cobros HIOPOS se anclan solos por `Cód. Tienda` al ingerir
  (validado: Rochino son **2 tiendas** — FRENCH 2153: 555 cobros · BLE URUGUAY: 1445).
  **Falta (2/2):** linkear transacciones **Payway** por un mapeo (nro establecimiento Payway →
  tienda, como `MapeoMedioPago`; la numeración ≠ HIOPOS) y que el **matching scopee por
  establecimiento**.
- **Después:** conciliación manual (grilla doble, 1:N/N:1, sugerencia=fuzzy bajo umbral,
  undo, audit) · E2 financiera (extracto bancario) · reportes 8 hojas · alertas ·
  **UX estilo PayConcil** (dark/fintech: reskin del MVP + 8 pantallas) · login (NextAuth).
- **Estados a adoptar:** `MANUAL_OK`, `DISPUTED` (E1); `NOT_FOUND`, `EXTRA_CREDIT`,
  `FIN_MANUAL_OK` (E2). Unir con los nuestros (que ya tienen PARCIAL/CONTRACARGO).
- **Perf pendiente:** la ingesta sincrónica de ~6000 filas tarda ~74s en la web → moverla a
  **background (worker)**, no en el request HTTP.
- **Bridge HIOPOS inestable** (timeouts/vacíos): infra de ICG; mitigado con reintentos+re-login;
  workaround = subir el archivo descargado a mano.
- **Credenciales pendientes:** Access Token MP de Rochino (cruce MP) · Clover/Fiserv (GARDINER).
- **Seguridad:** rotar el password de `neondb_owner` en Neon (quedó expuesto en chat).

## Convenciones de código

- Identificadores de dominio en español, siguiendo el modelo canónico (`Cobro`,
  `Transaccion`, `Liquidacion`, etc.).
- Comentarios en español.
- TypeScript estricto.
