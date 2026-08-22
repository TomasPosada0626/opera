# ADR 0003: Cliente de escritorio Electron sobre una SPA servida

## Estado

Aceptada.

## Contexto

El cliente de Opera es la única interfaz del ERP — no hay una API pública consumida
por terceros, solo esta SPA de React hablando con el backend NestJS por la LAN (ver
[Arquitectura](../../README.md#arquitectura)). Había dos formas estándar de
entregar esa SPA al Administrador que la opera:

- **SPA servida**: el frontend se compila a estático y se sirve por HTTP (desde el
  propio backend o un servidor estático aparte); el usuario abre un navegador,
  entra a una URL/IP de la LAN, y trabaja desde ahí.
- **Cliente empaquetado (Electron)**: el frontend se empaqueta junto a un runtime
  de Chromium + Node en un instalador (`electron-builder`, ver
  [Stack tecnológico](../../README.md#stack-tecnológico)); el usuario abre una app
  de escritorio como cualquier otra, sin URL ni navegador de por medio.

## Decisión

Opera empaqueta el frontend como app de escritorio con Electron, no como una SPA
servida por HTTP. Dos razones concretas, ya reflejadas en el código:

1. **Almacenamiento seguro del JWT.** Electron expone `safeStorage`, que cifra con
   las claves del sistema operativo (DPAPI en Windows, Keychain en macOS) —
   `electron/secure-token-store.ts` lo usa para que el token de sesión nunca quede
   en texto plano en disco (#92, ver entrada "Estado actual" del README). Una SPA
   servida está acotada a lo que ofrece el navegador: `localStorage`/
   `sessionStorage` (accesible por cualquier script si hay una brecha XSS, sin
   cifrado en reposo) o cookies (que traerían su propio manejo de CSRF). Antes de
   #92 el token sí vivía en `localStorage` — exactamente la superficie que una SPA
   servida habría dejado como única opción de forma permanente, no solo transitoria.
2. **El backend se queda siendo solo una API.** `ALLOWED_ORIGINS` en
   `packages/backend/src/main.ts` es literalmente `['http://localhost:5173', 'null']`
   — Vite en dev, y el renderer empaquetado cargado desde `file://` (que el
   navegador reporta como el string `"null"`). El backend nunca necesita servir
   HTML/JS/CSS ni resolver rutas de historial en un refresh — de ahí el ruteo por
   hash en `router.tsx`, consecuencia directa de cargar desde `file://` sin
   servidor. Una SPA servida movería esa responsabilidad al backend o a un
   servidor estático aparte, ensanchando la superficie del despliegue LAN (más
   orígenes que aceptar, un CORS más permisivo) sin un cliente adicional real que
   lo justifique hoy.

Para el Administrador que opera Opera día a día — el público de una PyME
manufacturera migrando desde hojas de cálculo, no un equipo técnico — un ícono de
escritorio que abre directamente el ERP también se siente más cercano a las
herramientas de gestión que ya conoce que "abrir un navegador y recordar una IP
interna" — pero esto es una razón secundaria, no la que decidió el empaquetado.

## Consecuencias

**A favor:**

- El JWT se cifra con las claves del sistema operativo vía `safeStorage`, en vez de
  vivir permanentemente en `localStorage` expuesto a XSS.
- El backend se mantiene enfocado en ser una API REST — CORS acotado a dos
  orígenes conocidos (`ALLOWED_ORIGINS`), sin servir estático ni resolver rutas de
  SPA para navegadores arbitrarios de la LAN.
- Experiencia de "app instalada" familiar para un Administrador no técnico.

**En contra / costos aceptados:**

- Sin actualizador automático todavía: una nueva versión requiere generar un
  instalador nuevo con `electron-builder` y reinstalarlo a mano en la máquina — una
  SPA servida se actualiza para todos con solo refrescar el navegador. Si Opera
  necesita distribuir actualizaciones con más frecuencia, esto es funcionalidad
  pendiente, no cubierta por este ADR.
- El instalador empaqueta un runtime completo de Chromium + Node, mucho más
  pesado en disco que abrir una pestaña de navegador contra una SPA servida.
- Ruteo por hash (`/#/pedidos` en vez de `/pedidos`) en vez de rutas de historial
  limpias — cosmético, pero es un efecto directo de cargar desde `file://` sin
  servidor.
- Si el despliegue algún día necesita varias máquinas concurrentes por empresa
  (más de un usuario operando a la vez), cada una necesita su propio instalador —
  una SPA servida habría dado eso "gratis" con solo abrir una pestaña más. Se
  acepta este costo porque `ALLOWED_ORIGINS` y el modelo actual ya asumen un solo
  tipo de cliente; si ese supuesto cambia, es una decisión nueva a revisar, no una
  extensión automática de esta.
