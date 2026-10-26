-- El identificador de acceso (User.email: un correo o un nombre de
-- usuario) se guarda y se busca en minúsculas desde ahora: la API lo
-- normaliza al recibirlo (ver auth/login-identifier.ts). Se pasan a
-- minúsculas los que ya existían para que sigan pudiendo entrar, salvo que
-- eso choque con otra cuenta que solo se diferencia en mayúsculas (la
-- migración no debe fallar por eso: esa cuenta queda como estaba).
UPDATE "User" AS u
SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1
    FROM "User" AS other
    WHERE other."id" <> u."id"
      AND lower(trim(other."email")) = lower(trim(u."email"))
  );
