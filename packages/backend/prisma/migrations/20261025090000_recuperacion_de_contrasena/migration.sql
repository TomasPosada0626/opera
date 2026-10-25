-- Estado de recuperación de contraseña en su propia tabla (ver el
-- comentario de PasswordRecovery en schema.prisma): guardarlo en User
-- movía User.updatedAt y cerraba la sesión del usuario.

-- CreateTable
CREATE TABLE "PasswordRecovery" (
    "userId" TEXT NOT NULL,
    "resetCodeHash" TEXT,
    "resetExpiresAt" TIMESTAMP(3),
    "resetAttempts" INTEGER NOT NULL DEFAULT 0,
    "recoveryCodeHash" TEXT,
    "recoveryCodeCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordRecovery_pkey" PRIMARY KEY ("userId")
);

-- Un código de correo pendiente no se pierde con el cambio.
INSERT INTO "PasswordRecovery" ("userId", "resetCodeHash", "resetExpiresAt", "updatedAt")
SELECT "id", "passwordResetCodeHash", "passwordResetExpiresAt", CURRENT_TIMESTAMP
FROM "User"
WHERE "passwordResetCodeHash" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordResetCodeHash",
DROP COLUMN "passwordResetExpiresAt";

-- AddForeignKey
ALTER TABLE "PasswordRecovery" ADD CONSTRAINT "PasswordRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
