# ADR 0006: Retención y archivado de AuditLog y StockMovement

## Estado

Aceptada.

## Contexto

`AuditLog` y `StockMovement` son las dos únicas tablas del schema que crecen
sin límite natural: una fila nueva por cada mutación de negocio (`AuditLog`,
ver `AuditService.log()`) y una fila nueva por cada entrada/salida/ajuste de
inventario (`StockMovement`, ver [ADR 0001](0001-kardex-append-only.md)).
Todo lo demás (catálogo, usuarios, pedidos) crece con el tamaño del negocio,
no con el tiempo transcurrido. La re-auditoría de este proyecto señaló que
ninguna de las dos tenía una estrategia de retención explícita — no porque
sea un problema hoy (el load test de referencia en
`load-tests/README.md` mide ~48.000 filas de `StockMovement` acumuladas en 3
años simulados con latencias p95 de decenas de milisegundos, ver esa
tabla), sino porque **la ausencia de una decisión escrita es en sí misma el
riesgo**: sin esto por escrito, alguien podría "resolver" el crecimiento
algún día borrando filas de `StockMovement`, exactamente lo que ADR 0001
prohíbe.

## Decisión

**`StockMovement` nunca se archiva por borrado.** Es un ledger contable
append-only (ADR 0001) — cada fila es evidencia de por qué el stock es lo
que es, y en la mayoría de jurisdicciones un historial de inventario tiene
requisitos de retención de varios años por razones fiscales/contables que
Opera no está en posición de decidir por su cuenta. Si el volumen alguna vez
lo justifica de verdad (el load test de `load-tests/` es la señal, no una
sospecha), la única vía correcta es particionar la tabla por rango de fecha
(`PARTITION BY RANGE (createdAt)`, nativo de Postgres) — las particiones
viejas se pueden mover a almacenamiento más barato sin dejar de ser
consultables, algo que un `DELETE` no permite deshacer. Particionar hoy,
antes de tener evidencia real de que hace falta, sería exactamente la
optimización prematura que `load-tests/README.md` ya decidió no hacer para
`getAverageCost()` — el mismo criterio aplica acá.

**`AuditLog` sí es candidata a poda real**, porque es un registro operativo
(quién cambió qué y cuándo), no una pieza contable — pero **solo bajo
un proceso manual, explícito y exportable, nunca automático.** Cuánto tiempo
retener auditoría es una decisión de política/legal del negocio que Opera no
puede tomar por su cuenta (varía según el cliente, su jurisdicción y sus
propios requisitos internos). Por eso `scripts/archive-audit-log.ts`:

- Nunca corre solo — no hay ningún cron ni scheduler dentro del backend que
  lo dispare (Opera es LAN-first para un solo local, sin un proceso de
  fondo que lo justifique de todas formas).
- Exporta antes de borrar: cada fila que se va de la tabla queda primero en
  un `.jsonl` en disco, nunca se pierde información.
- Exige `--confirm` explícito para efectivamente borrar — sin esa bandera,
  corre en modo "solo mostrar qué borraría" (dry-run).

## Consecuencias

**A favor:**

- Cero riesgo de que una futura "limpieza" borre por accidente evidencia de
  inventario real — la única forma de reducir `StockMovement` (particionar)
  sigue dejando el dato consultable.
- `AuditLog` tiene una vía de poda real cuando algún cliente de verdad la
  necesite, sin haber construido infraestructura (cron, retención
  automática) que Opera no tiene forma de calibrar correctamente hoy.
- La decisión de _cuándo_ usar `archive-audit-log.ts` (y con qué ventana de
  retención) queda donde debe estar: en quien opera cada instalación, no
  hardcodeada en el código.

**En contra / costos aceptados:**

- Si `AuditLog` sí crece a un tamaño problemático, alguien tiene que
  acordarse de correr el script a mano — no hay ninguna alarma automática
  que lo recuerde. Aceptable: el mismo `load-tests/` ya establece que este
  proyecto revisa volumen bajo demanda (correr el load test), no con
  monitoreo continuo, y `AuditLog` no es distinta en ese sentido.
- Particionar `StockMovement` el día que el volumen lo justifique es una
  migración real (mover datos existentes a la partición correcta, no solo
  `ALTER TABLE`) — se pospone deliberadamente hasta tener esa evidencia, no
  porque sea gratis hacerlo después.
