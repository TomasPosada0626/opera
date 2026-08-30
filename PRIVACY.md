# Política de tratamiento de datos personales (plantilla)

> **Aviso legal — leé esto antes que el resto del documento.** Este texto lo
> redactó un asistente de IA a partir del código y las decisiones de
> arquitectura de Opera, como punto de partida técnico para cerrar el
> hallazgo de la auditoría 2026-08-28 sobre documentos mínimos de
> cumplimiento. **No es asesoría legal formal.** Opera es software que cada
> empresa despliega para su propia operación (ver
> [ADR 0003](docs/adr/0003-electron-sobre-spa-servida.md)) — quien lo
> despliega es quien actúa como responsable del tratamiento frente a sus
> clientes, proveedores y empleados, no el proyecto de software en sí. Antes
> de publicar o entregar este documento a terceros, hacelo revisar y
> completar por un abogado colombiano especializado en protección de datos
> (Ley 1581 de 2012 y su Decreto reglamentario 1377 de 2013), que debe:
>
> - Completar la identidad legal de la empresa (razón social, NIT,
>   domicilio) donde este documento dice `[COMPLETAR]`.
> - Definir el canal oficial de contacto para que un titular ejerza sus
>   derechos.
> - Confirmar que el mecanismo técnico descrito más abajo (anonimización,
>   ver hallazgo #15 de la auditoría) satisface las obligaciones específicas
>   de esa empresa, y si corresponde separarlo en un Aviso de Privacidad y
>   una Política de Tratamiento como documentos distintos.

## Responsable del tratamiento

`[COMPLETAR: razón social]`, NIT `[COMPLETAR]`, con domicilio en
`[COMPLETAR]`, es responsable del tratamiento de los datos personales que
se describen en este documento, recolectados a través de su instalación de
Opera.

## Qué datos personales procesa Opera

- **Terceros (clientes y proveedores)** — modelos `Customer`/`Supplier`:
  nombre, NIT, correo, teléfono y dirección. Se usan para gestionar pedidos,
  remisiones y compras — la relación comercial es el fundamento del
  tratamiento.
- **Usuarios internos de la app** — modelo `User`: nombre y correo de cada
  persona con una cuenta en el sistema (empleados que operan Opera). Se usan
  para autenticación, control de acceso por rol y atribución de cada acción
  en `AuditLog` — el fundamento es la relación laboral/contractual con quien
  opera la instalación.

Opera es LAN-only y single-tenant por diseño (ADR 0003): estos datos no
salen de la red de la empresa hacia ningún tercero ni proveedor en la nube.

## Cómo se protegen

- Contraseñas con Argon2id (por encima del mínimo recomendado por OWASP),
  nunca en texto plano ni reversibles.
- Sesión JWT revalidada contra la base de datos en cada solicitud (no solo
  contra el contenido del token), con RBAC reforzado por un guard
  reutilizable.
- Cada creación, edición, desactivación o borrado de datos personales queda
  registrada en `AuditLog` con usuario, fecha y estado anterior/posterior —
  excepto el estado anterior a un borrado de PII, que nunca se guarda (ver
  más abajo).
- Sin exposición a internet por diseño — la app y su base de datos viven en
  la LAN de la empresa. La ausencia de TLS en esa LAN es una decisión
  documentada y explícita, no un descuido (ver
  [ADR 0007](docs/adr/0007-sin-tls-lan-de-confianza.md)), condicionada a que
  esa LAN siga siendo de confianza.

## Cuánto tiempo se conservan los datos

Mientras la relación comercial o laboral esté activa, o hasta que su titular
ejerza el derecho de supresión descrito abajo. Dos excepciones documentadas:

- **`StockMovement`** (historial de inventario) nunca se borra — es un
  ledger contable append-only con requisitos de retención fiscal que la
  empresa no puede decidir por su cuenta (ver
  [ADR 0001](docs/adr/0001-kardex-append-only.md)).
- **`AuditLog`** solo se poda mediante un proceso manual y exportable
  (`packages/backend/scripts/archive-audit-log.ts`), nunca automáticamente
  (ver
  [ADR 0006](docs/adr/0006-retencion-auditlog-stockmovement.md)).

Por eso, cuando un cliente, proveedor o usuario pide que se eliminen sus
datos, Opera **anonimiza** en vez de borrar físicamente: el pedido/compra ya
registrado se conserva (sigue apuntando a un id real, con la razón contable
de arriba), pero el nombre, NIT, correo, teléfono y dirección de esa persona
o empresa se sobreescriben de forma permanente e irreversible.

## Derechos del titular (Ley 1581 de 2012)

Como titular de los datos, tenés derecho a:

- Conocer, actualizar y rectificar tus datos personales.
- Solicitar prueba de la autorización otorgada para su tratamiento.
- Ser informado sobre el uso que se les ha dado.
- Presentar quejas ante la Superintendencia de Industria y Comercio (SIC)
  por infracciones a la ley.
- Revocar la autorización y/o solicitar la supresión de tus datos, cuando no
  exista un deber legal o contractual que impida eliminarlos.

## Cómo ejercer estos derechos

Escribí a `[COMPLETAR: canal de contacto]` indicando qué derecho querés
ejercer. Quien administra la instalación de Opera puede:

1. Desactivar tu registro (`Customer`/`Supplier`/`User`) — reversible,
   detiene su uso en operaciones nuevas.
2. Borrar tus datos personales de forma permanente ("Borrar datos" en la
   pantalla de Clientes, Proveedores o Usuarios) — irreversible, solo
   disponible sobre un registro ya desactivado.

## Vigencia

Este documento aplica desde `[COMPLETAR: fecha]` y se actualiza cada vez que
cambie de forma sustancial qué datos procesa Opera o cómo los protege.
