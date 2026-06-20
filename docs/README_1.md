# ConciliacionCobros

Solución para conciliar los cobros registrados en **HIOPOS** contra las plataformas
de cobro (**Mercado Pago** y **Payway**), diseñada para escalar a múltiples clientes
que usan HIOPOS como sistema de gestión.

> **Estado:** en diseño. El código todavía no arrancó; por ahora el repo contiene
> la documentación funcional y técnica.

## Qué resuelve

La conciliación se modela en dos etapas encadenadas:

1. **Operativa** — cobro registrado en HIOPOS ↔ transacción autorizada en el
   procesador (detecta cobros fantasma, transacciones faltantes, diferencias de
   monto).
2. **Financiera** — transacción autorizada ↔ liquidación efectiva en el banco
   (aranceles, retenciones, cuotas diferidas, contracargos).

El motor es central y multi-tenant; cada cliente ve el estado de conciliación dentro
de HIOPOS, con el detalle completo en una web app aparte.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/arquitectura-conciliacion-v1.md`](docs/arquitectura-conciliacion-v1.md) | Arquitectura en capas, multi-tenancy, ritmo, matching, estrategia de presentación |
| [`docs/modelo-datos-conciliacion-v1.md`](docs/modelo-datos-conciliacion-v1.md) | Modelo de datos canónico, entidades, máquinas de estado, índices |

## Stack previsto

- PostgreSQL (Neon)
- Prisma (ORM)
- Node.js + TypeScript
- Scheduler (cron + cola)

## Próximos pasos

- [ ] `schema.prisma` a partir del modelo canónico
- [ ] Adaptadores de ingesta (HIOPOS, Mercado Pago, Payway)
- [ ] Motor de matching (determinístico + fuzzy)
- [ ] Write-back de estados a HIOPOS
- [ ] Web app de conciliación
