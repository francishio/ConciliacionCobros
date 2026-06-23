# Findings — Análisis PayConcil v2.0 (UX + DAF) vs. ConciliacionCobros

**Fecha:** 2026-06-23 · **Estado:** análisis para discusión (NO se modificó código ni schema)

Materiales analizados: `mockup_conciliador_v2_1.html` (UX, 8 pantallas) + `DAF_PayConcil_v2.0.docx`
(documento de alcance funcional). Este doc consolida qué ideas adoptar, qué ya tenemos, y las
decisiones abiertas. Nada acá está implementado todavía.

---

## 0. Lectura de entrada

PayConcil y ConciliacionCobros son **el mismo producto**: conciliar ventas del ERP (HIOPOS) contra
plataformas de cobro y contra el banco, en **2 etapas** (operativa + financiera), multi-pasarela.

- **Nosotros vamos adelante en ejecución**: motor operativo (determinístico + fuzzy + multi-pasarela)
  funcionando y **validado con datos reales de Rochino (~78% auto)**, ingesta real (HIOPOS/Payway/MP),
  RLS multi-tenant, web app MVP.
- **PayConcil va adelante en spec**: multi-establecimiento formal, Etapa 2 financiera detallada,
  pantalla de conciliación manual, gobernanza (audit/undo/reason codes), alertas tipadas, reportes.

→ El DAF es prácticamente nuestra **hoja de ruta funcional** ya redactada. La estrategia: **adoptar
sus ideas buenas sobre la base sólida que ya tenemos**, sin rehacer lo validado.

---

## 1. Mapeo de modelos (nuestro ↔ PayConcil)

| Nuestro (Prisma) | PayConcil (DAF) | Notas |
|---|---|---|
| `Tenant` | `company` **+** `establishment` | ⚠️ Ellos separan empresa de establecimiento. Decisión §3. |
| `Cobro` | `erp_transactions` | venta del ERP |
| `Transaccion` | `platform_transactions` | reconocimiento de la plataforma |
| `Match` | `operational_reconciliation` | resultado E1 |
| `Liquidacion` / `LiquidacionLinea` | `platform_settlements` | neto agrupado por plataforma/período |
| `Retencion` | (campos `total_taxes`, `total_fee`) | ellos lo desglosan comisión+IVA+IIBB |
| (no tenemos) | `bank_statement_lines` | extracto bancario — nuestra **Fase 2** |
| (no tenemos) | `financial_reconciliation` | resultado E2 — nuestra **Fase 2** |
| `MatchingProfile` | config por plataforma (`settlement_tolerance`, `bank_description_keywords`, ventana) | ellos la ponen **por plataforma**, nosotros por tenant |
| `MapeoMedioPago` | mapeo medio→plataforma | concepto equivalente |
| `Excepcion` | alerts + bandeja de conciliación manual | ellos lo parten en 2 capas |
| (no tenemos) | `import_sessions` | cada carga es una sesión trazable |
| (no tenemos) | `manual_match_events` / `manual_match_items` | conciliación manual 1:N/N:1 |
| (no tenemos) | `audit_log`, `reconciliation_notes` | gobernanza |

---

## 2. Lo que VALIDA nuestro diseño (no rehacer)

- **2 etapas secuenciales** (E2 solo si E1 OK) — idéntico. Ellos lo hacen constraint duro
  (`op_status ∈ {MATCHED,PARTIAL,MANUAL_OK}`).
- **Algoritmo E1**: exact por `auth_code` → fuzzy por monto+fecha → ticket/cupón. **Es exactamente
  nuestra cascada** determinístico→fuzzy. Validación cruzada del enfoque.
- **E2 a nivel depósito/liquidación** (un depósito = N transacciones): es nuestro "match fuzzy a nivel
  pila" de la Fase 2 (arquitectura §11). Coincide.
- **Multi-pasarela** con modos de ingesta distintos (API/CSV/Email/Manual): nuestro patrón de adaptadores.
- **RLS / aislamiento**: su RNF-SEG-06/07 (filtro por company en JWT + chequeo por request) es un
  **requerimiento que nosotros ya cumplimos mejor** — a nivel de base con RLS fail-closed (`app_runtime`).

---

## 3. La decisión GRANDE: multi-establecimiento 🏢

**PayConcil**: `companies → establishments → users`, con `user_establishment_access` (permisos N:M),
y `establishment_id` NOT NULL en transacciones/cargas/conciliaciones. La conciliación corre **por
establecimiento**; el dueño ve **consolidado de empresa**.

**Nosotros**: `Tenant` plano (= una tienda).

**Por qué es real**: el Excel de Payway de Rochino traía **varios `ESTABLECIMIENTO`** → un cliente
puede tener varias sucursales/terminales. Es un concepto de primera clase, no un detalle.

### Propuesta (a discutir, no implementada)
Aprovechar lo que ya tenemos: **mantener `Tenant` como la EMPRESA** (la frontera de RLS / aislamiento,
que ya funciona) y agregar **`Establecimiento`** como dimensión operativa **debajo** del tenant:
- `Establecimiento { id, tenantId, nombre, tipo, ... }`
- `establecimientoId` (FK, nullable al principio) en `Cobro` y `Transaccion`.
- La conciliación filtra por establecimiento; la RLS sigue en `tenantId` (= empresa) **sin cambios**.
- Vista consolidada = sin filtro de establecimiento, dentro del tenant.
- Usuarios/permisos por establecimiento → cuando hagamos login real.

Ventaja: **reusa toda la RLS actual** (no tocamos el aislamiento) y agrega el nivel que falta.
Esto también resolvería de fondo la ambigüedad que vimos en el matching de Rochino (cobros de una
tienda contra transacciones Payway de varias terminales).

---

## 4. Estados — los suyos son más ricos, vale alinear

### Etapa 1 — `op_status`
| PayConcil | Nuestro `EstadoOperativa` | Acción |
|---|---|---|
| MATCHED | OK | = |
| PARTIAL | DIFERENCIA_MONTO | = (ellos también incluyen "retenciones no configuradas") |
| UNRECOGNIZED | SIN_TRANSACCION | = |
| PENDING | PENDIENTE | = |
| (revisión) | EN_REVISION | nuestro intermedio antes del manual |
| **MANUAL_OK** | — | ⭐ **adoptar**: distingue match manual del automático (clave para auditoría) |
| **DISPUTED** | — | ⭐ **adoptar**: diferencia reclamada formalmente, suspende avance |

### Etapa 2 — `fin_status` (nuestra Fase 2)
| PayConcil | Nuestro `EstadoFinanciera` | Acción |
|---|---|---|
| CREDITED | ACREDITADO | = |
| DIFF_AMOUNT | DIFERENCIA | = |
| IN_TRANSIT | PENDIENTE | ≈ |
| (cuotas) | PARCIAL | nuestro, por cuotas — mantener |
| (contracargo) | CONTRACARGO | nuestro — mantener |
| **NOT_FOUND** | — | ⭐ adoptar: liquidación sin crédito bancario |
| **EXTRA_CREDIT** | — | ⭐ adoptar: crédito bancario huérfano (doble depósito/reintegro) |
| **FIN_MANUAL_OK** | — | ⭐ adoptar |

> Nuestros estados tienen cosas que ellos no (PARCIAL/CONTRACARGO por cuotas). Conviene **unir** ambos
> sets, no reemplazar.

---

## 5. Ideas a ADOPTAR, por módulo

### 5.1 Conciliación manual asistida (⭐ alta prioridad — es nuestra cola de excepciones)
- **Grilla doble**: origen sin match (izq) ↔ cobranza sin asignar (der). Seleccionar de cada lado → confirmar.
- Soporta **1:1, 1:N (cuotas), N:1 (depósito agrupado)** → tablas `manual_match_events` + `manual_match_items`.
- **reason_code + free_text obligatorios** si la diferencia supera tolerancia.
- **Sugerencia (IA)** = correr nuestro fuzzy con umbral bajo (0.4–0.7) y resaltar candidatos. **Ya tenemos
  el scoring** — solo hay que surfacearlo.
- **Deshacer (24 hs)** + `audit_log`.
- Mismo patrón de pantalla sirve para E1 y E2 (switch de etapa).
- → Implementable sobre nuestro `Match` (estado `CONFIRMADO_MANUAL` ya existe) + `Excepcion`.

### 5.2 Etapa 2 financiera (nuestra Fase 2, ellos la detallan)
- Agrupar `platform_transactions` (op_status OK) por plataforma+período → liquidación neta esperada.
- Buscar en extracto por **monto ± tol + keywords de la plataforma en la descripción + fecha ± ventana**.
- `platforms.bank_description_keywords` (ej. `["MERCADOPAGO","MP S.A."]`) — config para identificar depósitos.
- Movimientos no-plataforma (comisión banco, etc.) → marcados "No plataforma", fuera del motor.
- Ingesta de extracto: **OFX/CSV/XLSX**, por `bank_account` (CBU), detección de banco por header.

### 5.3 Ingesta
- **`import_sessions`**: cada carga es una sesión trazable (estado, archivo, establecimiento). ⭐ adoptar.
- Config de tolerancia/keywords **por plataforma** (no solo por tenant).

### 5.4 Reportes (export contable)
- Excel **8 hojas**: Resumen · E1_OK · E1_Diferencias · E1_NoReconocidas · E2_Acreditadas · E2_DifBanco ·
  E2_NoEncontradas · Comisiones. Con **destinatario por hoja** y opción consolidado (columna Establecimiento).

### 5.5 Alertas (capa nueva)
- Tipadas por severidad: `ALT-E1-*` (operativas), `ALT-E2-*` (financieras), `ALT-EST-*` (multi-estab).
- Al principio se pueden modelar como `Excepcion` con tipo/severidad; luego una entidad propia.

### 5.6 Gobernanza
- `audit_log` (from_status, to_status, user, timestamp, ip) en cada cambio manual.
- `reconciliation_notes` (reason_code + free_text).
- Credenciales bancarias enmascaradas en UI (últimos 4).

---

## 6. Gaps / decisiones abiertas (para acordar antes de implementar)

1. **Multi-establecimiento** (§3): ¿`Tenant`=empresa + `Establecimiento` debajo? — **la más importante**.
2. **Estados**: ¿unimos los enums (agregar MANUAL_OK, DISPUTED, NOT_FOUND, EXTRA_CREDIT, FIN_MANUAL_OK)?
3. **Config por plataforma vs por tenant**: ¿movemos tolerancia/ventana/keywords a nivel plataforma?
4. **import_sessions + audit_log + notes**: ¿los incorporamos ya (trazabilidad) o después?
5. **Estética**: PayConcil es dark/fintech; nuestro MVP es claro/minimal. Definir dirección visual.

---

## 7. Propuesta de priorización (sugerencia, a discutir)

Sobre lo que YA tenemos funcionando, el orden de mayor valor/menor fricción:

1. **Optimizar el motor en la web** (el raw jsonb que hace tardar 130s) — pendiente técnico ya detectado.
2. **Conciliación manual asistida** (§5.1) — completa la web app y es donde el usuario trabaja los breaks.
   Reusa nuestro `Match`/`Excepcion`/fuzzy.
3. **Multi-establecimiento** (§3) — decisión estructural; conviene antes de crecer en clientes reales.
4. **Etapa 2 financiera** (§5.2) — el mayor valor económico; ya diseñada (arquitectura §11), ahora con el
   detalle del DAF.
5. **Reportes 8 hojas** (§5.4) y **alertas** (§5.5).
6. **Gobernanza** (audit/undo/notes) y **login real** + permisos por establecimiento.

> Nada de esto está implementado. Es la base para decidir juntos qué entra primero.
