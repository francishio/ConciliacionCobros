# Arquitectura — Solución de Conciliación HIOPOS ↔ Procesadores de Pago

**Versión:** 1.0
**Fecha:** 2026-06-20
**Estado:** Diseño inicial (pendiente de validar puntos de la sección 10)

---

## 1. Objetivo

Conciliar los cobros registrados en HIOPOS contra las plataformas de cobro
(Mercado Pago y Payway), de forma **escalable para múltiples clientes** que usan
HIOPOS como sistema de gestión.

La solución debe:

- Detectar diferencias entre lo cobrado y lo efectivamente acreditado.
- Funcionar como motor central con vista cruzada (para el equipo de soporte) y a
  la vez dar visibilidad a cada cliente.
- Soportar configuración por cliente (cada uno con su propio HIOPOS, su cuenta de
  MP y su establecimiento Payway).

---

## 2. El problema: dos conciliaciones encadenadas

No es una sola conciliación, son **dos**, y la mayor parte del dinero perdido
aparece en la segunda:

1. **Conciliación operativa** — *cobro registrado en HIOPOS ↔ transacción
   autorizada en el procesador.* Detecta cobros fantasma, transacciones que el
   cajero no cargó, montos que no coinciden, anulaciones mal hechas.

2. **Conciliación financiera** — *transacción autorizada ↔ liquidación efectiva
   en el banco.* Acá aparecen aranceles, retenciones impositivas (IIBB, IVA,
   ganancias), cuotas que se acreditan en fechas distintas y contracargos. Es la
   que casi nadie hace bien.

Una venta en cuotas puede figurar en HIOPOS hoy, liquidarse en varias fechas
distintas y acreditarse neta de comisiones. El motor tiene que entender ese ciclo
de vida completo, no solo el monto.

---

## 3. Asimetría de las fuentes (define la capa de ingesta)

Las plataformas no exponen los datos igual, lo que obliga a tener **adaptadores
distintos por proveedor**:

| Aspecto | Mercado Pago | Payway |
|---|---|---|
| Acceso | API real | Portal (Mi Payway Profesional) |
| Tiempo real | Webhooks de pago | No |
| Liquidaciones | Reporte programable vía API (CSV) | Reportes descargables, diarios/mensuales por marca |
| Repositorio | Opción SFTP propio | Descarga programada |
| Clave de match | Campo `external_reference` (inyectable) | TID por transacción |
| Modo de ingesta sugerido | API + webhook | Archivo (reporte programado) |

**Conclusión de diseño:** la capa de ingesta debe soportar *pull por API*,
*webhook push* y *archivo (CSV/SFTP)*, según el proveedor. Por eso el patrón es
**adaptadores con una interfaz común**.

---

## 4. Arquitectura en capas

```
  HIOPOS              Mercado Pago           Payway
  (PortalRest/ISIS)   (API · webhook · CSV)  (Mi Payway · archivo)
       │                    │                      │
       └────────────────────┴──────────────────────┘
                            │
                  Capa de adaptadores
                (interfaz común por proveedor)
                            │
              Normalización — modelo canónico
              (Cobro · Transaccion · Liquidacion)
                            │
              ┌─────────────┴─────────────┐
        Etapa 1 · Operativa        Etapa 2 · Financiera
        (cobro POS ↔ transacción)  (transacción ↔ liquidación)
              └─────────────┬─────────────┘
              ┌─────────────┴─────────────┐
       Gestión de excepciones      Dashboard + export
       (breaks categorizados)      (por cliente · contable)

  [transversal] Multi-tenant: credenciales aisladas · scheduler/cola · auditoría
```

**Capas:**

1. **Adaptadores / conectores** (uno por fuente): HIOPOS (PortalRest API / ISIS),
   MP (API + webhook + reporte de liquidaciones), Payway (ingesta por archivo).
2. **Normalización:** mapea cada fuente al modelo canónico, independiente del
   proveedor.
3. **Motor de conciliación:** matching de dos etapas (operativa + financiera),
   con máquinas de estado.
4. **Gestión de excepciones:** cola de breaks categorizados para revisión.
5. **Presentación:** dashboard por cliente y export contable.

---

## 5. Multi-tenancy y escalabilidad

- **Vault de credenciales por tenant** (token de MP, establecimiento Payway,
  acceso HIOPOS).
- **Aislamiento de datos:** `tenant_id` en todas las tablas + Row-Level Security
  (RLS) en Postgres. Schema-per-tenant solo si el volumen lo justifica.
- **Motor central** con vista cruzada para soporte: la data NO se desparrama en N
  instancias de HIOPOS; vive centralizada.
- **Job runner** con cron + cola que orquesta ingesta y matching por tenant. La
  conciliación es un workload batch/asíncrono; no encaja en funciones serverless
  con timeouts cortos (worker dedicado, o Inngest/Trigger.dev).

---

## 6. Ritmo de conciliación

Las dos conciliaciones tienen ritmos distintos por naturaleza:

- **Operativa → batch diario**, anclada al cierre (cierre de lote / cierre de caja
  Z). Cruza los cobros del día contra las transacciones autorizadas del día.
- **Financiera → ventana móvil (60–90 días)**, re-disparada cada vez que llega una
  liquidación nueva. No se cierra una transacción hasta matchear su acreditación
  real neta de comisiones (coincide con los ~90 días de historial de Payway).
- **Near-real-time:** descartado como objetivo general (la plata entra diferida
  igual). Única excepción útil: alertas de fraude/error operativo vía webhooks de
  MP, a sumar más adelante.

---

## 7. Estrategia de matching (mixto por cliente)

El nivel de integración del medio de pago varía por cliente, así que el motor usa
un **perfil de matching configurable por tenant** y corre en cascada:

1. **Determinístico (caso feliz):** si el medio de pago está integrado a HIOPOS,
   el ticket guarda código de autorización / lote / cupón, y del lado MP se
   estampa el `external_reference` con el ID de ticket. Match 1:1.
2. **Fuzzy (fallback):** sin clave compartida (terminal standalone), se cruza por
   importe exacto + ventana temporal (±X min) + marca de tarjeta + últimos 4
   dígitos. Con **scoring y tolerancia**: candidato único dentro de tolerancia →
   match automático; varios o ninguno → cola de excepciones (revisión humana).
   Nunca se fuerza un match fuzzy ambiguo.

El flag del perfil del tenant indica si existe clave determinística para ese
cliente.

---

## 8. Stack tecnológico

- **Base de datos:** PostgreSQL en Neon (fuente de verdad).
- **ORM / capa de datos:** Prisma (schema + migraciones + cliente tipado).
- **Runtime / lógica:** Node.js + TypeScript.
- **Scheduler:** cron + cola (worker dedicado).

> Prisma es solo la capa de datos. El motor de conciliación (matching, máquinas de
> estado) y el scheduler son código TypeScript aparte que *usan* el cliente de
> Prisma. Reutilizar la versión y el setup de Prisma ya probados en gastronomia-app.

---

## 9. Estrategia de presentación al cliente

Dos niveles complementarios:

- **Neon = sistema de registro** (la verdad), con el detalle completo accesible vía
  una web app de conciliación (breaks, liquidaciones, excepciones).
- **HIOPOS = capa de presentación (sink)**. Se hace write-back de **solo los
  resultados resumidos**: dos campos de estado por cobro
  (`estado_concil_operativa` y `estado_concil_financiera`), para que el cliente vea
  el semáforo dentro del entorno que ya usa.

**Reglas del write-back:**

- Neon es dueño del estado; HIOPOS es un cache eventualmente consistente.
- El mismo job que concilia hace el write-back como **upsert idempotente y
  best-effort**: si falla, no rompe nada, queda en cola de reintento.
- El campo financiero se re-escribe cuando evoluciona (ej. PARCIAL → ACREDITADO).
- El write-back es una **capa de enriquecimiento opcional y desacoplada**: el
  sistema funciona completo aunque el campo en HIOPOS no exista.

---

## 10. Decisiones abiertas / a validar

- **Write-back a HIOPOS:** confirmar internamente (ICG) la vía exacta — campo
  custom escribible vía API sobre ticket cerrado (validado como factible), que sea
  metadata interna sin tocar el payload fiscal del comprobante.
- **Presentación vía Analytics:** evaluar si ICGAnalytics puede surfacear un dato
  generado afuera (cubo/tabla custom configurada por el distribuidor).
- **Retenciones:** decidir si van sumadas en un decimal o desglosadas por tipo
  impositivo en su propia tabla.
- **Refresh del Project:** confirmar cómo se actualiza el conocimiento al conectar
  GitHub (depende del plan).
