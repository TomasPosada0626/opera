# Contribuir a Opera

Opera es un proyecto personal, pero abierto a contribuciones si encajan con
su alcance (ver [Roadmap](README.md#roadmap) y las [ADRs](docs/adr/)) y su
disciplina de ingeniería (RBAC desde la base, Kardex append-only,
transacciones con aislamiento explícito — ver
[Principios de diseño](README.md#principios-de-diseño)).

## Antes de abrir un PR

1. `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`
   (ver [Puesta en marcha](README.md#puesta-en-marcha)).
2. Corré el suite completo, no solo lo que tocaste:
   `pnpm test` (unit backend + desktop, con gate de cobertura) y
   `pnpm --filter backend test:e2e` (contra Postgres real).
3. `pnpm lint` y `pnpm format:check` sin errores.
4. Si agregás una librería nueva, sumala a la tabla de
   [Stack tecnológico](README.md#stack-tecnológico) en el mismo PR — no se
   documenta después.
5. Si es una decisión de arquitectura relevante (no un bugfix chico),
   documentala como ADR en `docs/adr/`, siguiendo el formato de las que ya
   existen (Contexto → Decisión → Consecuencias a favor/en contra).

## Convención de commits

Este repo sigue [Conventional Commits](https://www.conventionalcommits.org/)
con scope: `tipo(scope): descripción` — por ejemplo
`fix(auth): revalida JWT contra updatedAt`,
`feat(catalog): agrega paginación a proveedores`. Tipos usados en el
historial: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.

## Qué esperar de una PR

- CI corre auditoría de dependencias, lint, tests (con gate de cobertura en
  ambos paquetes), build de ambos paquetes y e2e reales contra Postgres en
  cada push — tiene que quedar en verde.
- CodeQL corre en cada push y semanalmente; si señala algo, se revisa antes
  de mergear.
- No hay bot de revisión automática — un humano revisa cada cambio.

## Reportar bugs

Abrí un [issue](https://github.com/TomasPosada0626/opera/issues) con pasos
para reproducir. Para vulnerabilidades de seguridad, ver
[SECURITY.md](SECURITY.md) — no las reportes como issue público.
