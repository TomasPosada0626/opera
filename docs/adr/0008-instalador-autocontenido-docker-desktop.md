# ADR 0008: Instalador autocontenido con Docker Desktop embebido

## Estado

Aceptada.

## Contexto

Hasta la sesión del 2026-09-01, instalar Opera en una PC nueva requería
tres pasos manuales separados: levantar Postgres (`docker compose up -d`),
compilar y correr el backend a mano (`node dist/src/main.js`), e instalar
por separado el `.exe` de escritorio. El caso real que forzó a resolver
esto fue instalar Opera en la PC de un familiar (uso real, "Herrajes
Toro") sin que esa persona tuviera que tocar una terminal.

Además, la única forma de crear el primer usuario administrador era
editando `ADMIN_EMAIL`/`ADMIN_PASSWORD` en un `.env` y corriendo
`pnpm db:seed` — si esas credenciales quedaran fijas y se repartieran con
el instalador, todas las instalaciones tendrían la misma contraseña de
administrador, y el repo es público, así que ni siquiera podría ser
secreta.

## Decisión

**Electron administra Postgres y el backend como procesos propios, en vez
de mantenerlos externos al ciclo de vida de la app.** `electron/
backend-manager.ts` corre `docker run`/`docker start` directo (sin
`docker compose`, para no depender del plugin `compose`, solo del CLI) con
argumentos fijos, aplica las migraciones de Prisma, y spawnea el backend
empaquetado como un proceso Node real (fuera del `.asar`, con
`extraResources`). Al cerrar Opera, apaga backend y Postgres; al volver a
abrir, reusa el contenedor si ya existe. Nombre de contenedor, volumen y
puerto son propios (`opera-postgres-app`, `opera_postgres_data_app`,
`5433`), distintos de los de `docker-compose.yml` (dev), para que abrir la
app empaquetada en la misma PC donde ya existe el Postgres de desarrollo
nunca reuse esa base por accidente.

**El instalador de Opera (NSIS, vía `electron-builder`) trae embebido el
instalador oficial de Docker Desktop** (`packages/desktop/build/
installer.nsh`) y lo instala en modo silencioso si hace falta, con
consentimiento explícito en una página propia del wizard — pedido por el
usuario ("para eso son las ventanas de instalación para aprobar o
denegar"). La alternativa (pedirle a la persona que instale Docker Desktop
a mano, desde afuera) reintroducía exactamente el paso manual con
terminal/instrucciones técnicas que este trabajo buscaba eliminar. Activar
Windows Subsystem for Linux/Virtual Machine Platform vía `dism.exe` puede
exigir un reinicio antes de que Docker Desktop pueda instalarse con
`--backend=wsl2`; ese reinicio se resuelve con una tarea de Windows
programada (`schtasks`, `SYSTEM`, `ONSTART`) que retoma la instalación en
modo silencioso apenas arranca Windows de nuevo, sin un segundo wizard ni
UAC.

**Instalar Docker Desktop desde el instalador de Opera acepta también su
licencia** (Docker Subscription Service Agreement) en nombre de quien
instala — el checkbox del wizard lo dice explícitamente. Herrajes Toro
califica como "empresa pequeña" bajo esa licencia (uso gratuito); Opera en
sí sigue MIT (ver README).

**Primera cuenta de administrador por instalación, no por `.env`**: nuevo
endpoint público `POST /setup/admin` (`setup.service.ts`) reemplaza
`prisma/seed.ts` para el flujo empaquetado — ese script se queda igual,
sigue sirviendo para dev/CI. Cada instalación crea su propia cuenta la
primera vez que se abre, guardada solo en esa base de datos local.

## Consecuencias

**A favor:**

- Instalar Opera en una PC nueva vuelve a ser un solo `.exe`, sin
  terminal, sin pasos manuales de Docker ni de `.env` — el objetivo real
  de esta sesión.
- Sin credenciales de administrador fijas repartidas con el instalador.
- El namespacing propio de Postgres hace imposible la colisión con un
  entorno de desarrollo en la misma máquina (encontrado como riesgo real:
  quien mantiene Opera también prueba el instalador empaquetado en su
  propia PC de desarrollo).

**En contra / costos aceptados:**

- El instalador pesa ~827 MB sin firmar (Docker Desktop embebido más el
  backend con `node_modules` de producción) — ver la sección
  "Compilación" del README para el detalle.
- El ciclo de activar WSL → reiniciar → retomar solo puede verificarse
  del todo en una PC real sin WSL previo; no hay forma de probarlo
  end-to-end desde CI ni desde un entorno de shell sin un reinicio real de
  Windows.
- Si la virtualización (Intel VT-x/AMD-V) está apagada en el BIOS/UEFI,
  ningún script puede activarla — el instalador detecta ese caso (Docker
  Desktop falla al iniciar) y muestra un mensaje explicando que hay que
  activarla manualmente, pero no puede resolverlo por sí solo.
