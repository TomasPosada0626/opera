# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público para una vulnerabilidad de seguridad. Usá el
[reporte privado de GitHub](https://github.com/TomasPosada0626/opera/security/advisories/new)
(pestaña **Security** → **Advisories** → "Report a vulnerability") para que
el detalle no quede expuesto antes de tener un fix.

Incluí: qué endpoint/componente, pasos para reproducir, y el impacto que
ves (qué se podría leer, modificar o hacer que no debería).

## Alcance

Opera es una app LAN-only, single-tenant, sin exposición pública a
internet por diseño (ver
[ADR 0003](docs/adr/0003-electron-sobre-spa-servida.md) y la sección
[Arquitectura](README.md#arquitectura) del README) — el modelo de amenaza
asumido es una LAN de confianza, no internet abierto. Aun así,
vulnerabilidades dentro de ese modelo son igual de válidas de reportar:
escalación de privilegios entre roles, bypass de RBAC, inyección, fuga de
datos entre usuarios de la misma instalación, o cualquier forma de eludir
la autenticación.

## Qué esperar

Este es un proyecto de un solo mantenedor — no hay SLA formal, pero un
reporte con pasos claros de reproducción se atiende en la medida de lo
posible, priorizado sobre trabajo de feature nueva.

## Versiones soportadas

No hay versiones LTS paralelas — solo se mantiene `main`. Actualizate a la
última release antes de reportar, por si ya está resuelto.
