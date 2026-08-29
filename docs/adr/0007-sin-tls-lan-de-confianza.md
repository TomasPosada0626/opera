# ADR 0007: Sin TLS en HTTP local ni SSL en la conexión a Postgres

## Estado

Aceptada.

## Contexto

El backend de Opera sirve HTTP plano (`packages/backend/src/main.ts`, sin
certificado ni `https.createServer`) y `DATABASE_URL` en `.env.example` no
lleva `sslmode` — la conexión de Prisma a PostgreSQL tampoco usa TLS. La
auditoría del 2026-08-28 señaló que esta decisión, razonable dado el diseño
LAN-only del proyecto, no estaba documentada como tal en ningún lado: ni un
ADR ni un comentario explícito, a diferencia de otras decisiones LAN-first
del código (ver [ADR 0003](0003-electron-sobre-spa-servida.md), y el
comentario en `docker-compose.yml` sobre por qué Postgres bindea a
loopback).

Dos superficies de red están en juego, con supuestos distintos:

1. **Backend ↔ Electron (desktop):** ambos corren en la misma máquina o en
   la misma LAN de confianza de la empresa (ver
   [Arquitectura](../../README.md#arquitectura)). No hay "internet" de por
   medio.
2. **Backend ↔ PostgreSQL:** `docker-compose.yml` bindea Postgres a
   `127.0.0.1` explícitamente — el backend y la base corren en el mismo
   host, nunca a través de la red.

## Decisión

Opera no usa TLS en ninguna de esas dos conexiones, a propósito, mientras
se sostenga el supuesto de despliegue LAN-only de un solo host (o LAN de
confianza) que el resto del proyecto ya asume (ADR 0003, aislamiento de
Postgres a loopback). No es una omisión — es la misma decisión de diseño
LAN-first aplicada de forma consistente, solo que hasta ahora sin quedar
escrita en ningún lado.

Esta decisión tiene una condición implícita que si se rompe, invalida el
razonamiento: **backend y PostgreSQL deben permanecer en el mismo host, y
el backend y los clientes Electron deben permanecer en una LAN que la
empresa controla.** Si algún día Opera necesita:

- Postgres en una máquina distinta al backend (no solo loopback), o
- el backend accesible desde fuera de la LAN de la empresa (una sucursal
  remota, acceso desde afuera),

esa es una decisión de arquitectura nueva que hay que tomar explícitamente
(y probablemente empieza por revertir este ADR), no una extensión
automática de "total, ya funciona sin TLS".

## Consecuencias

**A favor:**

- Sin el costo operativo de gestionar certificados (generación, renovación,
  distribución de una CA propia) para un despliegue de un solo host/LAN
  donde TLS no protege contra una amenaza real dado el modelo asumido.
- Coherente con el resto de decisiones LAN-first del proyecto (ADR 0003,
  Postgres a loopback) en vez de una excepción sin explicar.

**En contra / costos aceptados:**

- Si alguna vez el tráfico entre backend y Electron cruza un segmento de
  red menos confiable que la LAN interna de la empresa (Wi-Fi compartido
  con invitados, VPN mal segmentada), las credenciales (JWT, código de
  recuperación de contraseña) viajan en claro dentro de esa LAN. Mitigación
  hoy: es responsabilidad de quien opera la instalación segmentar la LAN
  correctamente, no algo que el software pueda garantizar por sí solo.
- Sin esta nota, alguien nuevo en el proyecto podía leer "sin TLS" como un
  descuido en vez de una decisión — este ADR es exactamente esa nota que
  faltaba.
