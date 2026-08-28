# ADR 0005: No migrar a Clean Architecture / DDD táctico

## Estado

Aceptada.

## Contexto

En una revisión de arquitectura post-M6 (auditoría letra por letra contra
DDD/SOLID/Clean Architecture) se evaluó explícitamente si Opera debería
reestructurarse hacia una Clean Architecture con Aggregates, Value Objects y
Domain Events — el estilo que [ADR 0004](0004-nestjs-prisma-sobre-alternativas.md)
ya dejó fuera implícitamente al elegir NestJS+Prisma con capas
controller/service/DTO, pero que nunca se descartó por escrito como decisión
propia. La pregunta no era hipotética: los ~20 módulos del backend (inventario,
producción, pedidos, remisiones, compras, catálogo) siguen todos el mismo
molde — un `*.service.ts` que habla con Prisma directamente, sin una capa de
dominio independiente de la persistencia ni Value Objects envolviendo
primitivos (`Prisma.Decimal` para cantidades/costos, `string` para IDs). Una
auditoría técnica posterior (nivel senior, cubriendo los 24 módulos del
backend) volvió a evaluar el mismo punto de forma independiente y llegó a la
misma conclusión, calificando la arquitectura en capas actual como sólida
para lo que el proyecto necesita — confirmación externa de que esta no es una
decisión que se esté evitando revisar, sino una que sigue sosteniéndose bajo
escrutinio repetido.

Los argumentos reales a favor de Clean Architecture/DDD táctico —
independencia de framework, aislar el dominio de la infraestructura para
poder testearlo sin mocks pesados, Aggregates que encapsulan invariantes
complejas, Domain Events para desacoplar efectos secundarios— son razones
reales en general, no ficticias. La pregunta correcta no es si son válidas en
abstracto, sino si el problema que resuelven existe en Opera.

## Decisión

**No migrar** a Clean Architecture con Aggregates/Value Objects/Domain
Events. Se mantiene la arquitectura en capas pragmática actual
(Controller → Service → Prisma), con las invariantes de negocio expresadas
como transacciones `Serializable` + guards atómicos (`updateMany` con el
estado en el `where`, ver el fix de concurrencia en `OrdersService
.markWarehoused`/`ProductionOrdersService.complete`) en vez de como métodos
de un Aggregate Root.

**Por qué el argumento de "independencia de framework" no aplica acá.**
Clean Architecture protege contra el costo de cambiar de framework o de
motor de base de datos. Opera es NestJS+Prisma+PostgreSQL de punta a punta,
por decisión explícita de [ADR 0004](0004-nestjs-prisma-sobre-alternativas.md), sin
ningún escenario de negocio real que exija poder intercambiar esa base — es
un ERP de un solo despliegue por cliente (LAN, single-tenant, ver
`packages/desktop/PRODUCT.md`), no una plataforma que se vende a integradores
que traen su propia infraestructura. Pagar la indirección de puertos/adaptadores
por una portabilidad que nunca se va a ejercer es coste sin beneficio.

**Por qué "testear el dominio sin infraestructura" no es un problema que
Opera tenga.** El valor de aislar el dominio de Prisma es poder testear
reglas de negocio con tests unitarios rápidos, sin una base de datos real.
Opera ya tiene esto por otra vía: los `*.service.spec.ts` mockean el
`PrismaService` por constructor (inyección de dependencias de Nest, ver ADR 0004) para la lógica pura, y los `*.e2e-spec.ts` corren contra Postgres real
para las invariantes que de verdad dependen de la base (concurrencia,
constraints, Serializable) — exactamente las que un dominio aislado de la
infraestructura no podría probar de todas formas, porque son propiedades de
la infraestructura. Separar el dominio no habría eliminado la necesidad de
esos e2e; los habría dejado exactamente igual de necesarios.

**Por qué "un solo desarrollador" pesa más de lo que parece.** Clean
Architecture paga cuando varios equipos trabajan en paralelo sobre módulos
distintos y necesitan fronteras explícitas para no pisarse — coordinación,
no solo estructura. Opera es un desarrollo en solitario: no hay equipos que
coordinar, y la disciplina de capas ya la impone el molde repetible de
NestJS (controller/service/DTO por módulo, ver ADR 0004) sin necesitar una
frontera de dominio adicional.

**El costo real, no solo el beneficio ausente.** Reescribir ~20 módulos ya
probados (con e2e reales contra Postgres, incluyendo los de concurrencia)
hacia Aggregates/Value Objects es trabajo real con riesgo real de introducir
regresiones en código que hoy funciona — el mismo tipo de riesgo que este
proyecto trata como algo a evitar activamente (ver la disciplina de
verificar cada cambio contra el suite completo antes de commitear, no solo
contra los tests que tocan directamente). Pagar ese riesgo a cambio de
protección contra escenarios (cambiar de ORM, escalar a multi-equipo) que no
están en el roadmap no es prudente, es especulativo.

## Consecuencias

**A favor de esta decisión:**

- Cero riesgo de regresión por reescritura de los ~20 módulos ya probados.
- El molde repetible de NestJS (ADR 0004) sigue siendo la única disciplina
  arquitectónica que hay que mantener, sin una capa adicional que aprender o
  recordar aplicar.
- Las invariantes de negoción reales (Kardex append-only, guard atómico
  contra doble-completado) ya están resueltas al nivel correcto — la
  transacción de base de datos — sin necesitar que un Aggregate las
  reimplemente en memoria.

**En contra / costos aceptados:**

- La lógica de negocio vive mezclada con las llamadas a Prisma dentro de
  cada `*.service.ts`, no aislada en un dominio independiente — un cambio de
  ORM (no planeado, no en el horizonte) tocaría todos los servicios, no una
  capa de infraestructura acotada.
- Sin Value Objects, es posible construir un `Prisma.Decimal` de cantidad
  negativa donde no correspondería sin que el sistema de tipos lo impida —
  la validación de esos casos vive en tests y en checks explícitos dentro de
  cada service, no en un tipo que lo haga estructuralmente imposible.
- Si el proyecto alguna vez creciera a varios equipos trabajando en paralelo
  sobre módulos distintos, esta decisión tendría que revisarse — no es una
  posición permanente, es la lectura correcta del contexto actual (ver
  también la nota equivalente sobre Drizzle en
  [ADR 0004](0004-nestjs-prisma-sobre-alternativas.md): no se reabre sin una
  razón concreta que el diseño actual no pueda resolver).
