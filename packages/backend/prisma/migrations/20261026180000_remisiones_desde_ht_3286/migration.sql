-- Herrajes Toro venía con un talonario de remisiones en papel que llegaba
-- hasta la HT 3285: las de Opera siguen desde la HT 3286 (el prefijo "HT"
-- es solo de presentación, ver src/remissions/remission-number.ts).
--
-- setval deja el último valor usado; el siguiente nextval() es ese + 1.
-- GREATEST: si alguna instalación ya tuviera remisiones con números
-- mayores, sigue desde la última en vez de repetir un número. Las
-- remisiones que ya existan conservan el suyo.
SELECT setval(
  pg_get_serial_sequence('"Remission"', 'number'),
  GREATEST(3285, (SELECT COALESCE(MAX("number"), 0) FROM "Remission"))
);
