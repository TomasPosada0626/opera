import { useState } from 'react';
import { Eraser, KeyRound, Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useDeactivateUser } from '../../hooks/useDeactivateUser';
import { useAnonymizeUser } from '../../hooks/useAnonymizeUser';
import { ApiError } from '../../lib/api-client';
import type { User } from '../../types/user';

interface UserRowActionsProps {
  user: User;
  isSelf: boolean;
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
}

// Desactivar vive en su propia fila (no en la página), mismo motivo que
// CustomerRowActions: cada botón necesita su propio estado de mutación/
// error. "Desactivar"/"Borrar datos" se ocultan para la propia cuenta — el
// backend ya bloquea ambas (ver UsersService.deactivate/anonymize), esto
// solo evita el viaje redondo de un 400 para un caso que nunca debería
// intentarse desde la UI.
export function UserRowActions({
  user,
  isSelf,
  onEdit,
  onResetPassword,
}: UserRowActionsProps) {
  const [confirmingAnonymize, setConfirmingAnonymize] = useState(false);
  const deactivateUser = useDeactivateUser();
  const anonymizeUser = useAnonymizeUser();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(user)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        <Button
          variant="ghost"
          onClick={() => onResetPassword(user)}
          className="px-3 py-1.5"
        >
          <KeyRound className="h-4 w-4" />
          Resetear contraseña
        </Button>
        {!isSelf &&
          (user.isActive ? (
            <Button
              variant="ghost"
              onClick={() => deactivateUser.mutate(user.id)}
              disabled={deactivateUser.isPending}
              className="px-3 py-1.5"
            >
              <UserX className="h-4 w-4" />
              {deactivateUser.isPending ? 'Desactivando…' : 'Desactivar'}
            </Button>
          ) : (
            // Solo sobre un usuario ya desactivado (#15, auditoría de
            // datos/legal) — borrar los datos personales es un paso legal
            // aparte de la decisión de negocio de desactivarlo.
            <Button
              variant="ghost"
              onClick={() => setConfirmingAnonymize(true)}
              className="px-3 py-1.5"
            >
              <Eraser className="h-4 w-4" />
              Borrar datos
            </Button>
          ))}
      </div>
      {deactivateUser.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateUser.error instanceof ApiError
            ? deactivateUser.error.message
            : 'No se pudo desactivar el usuario.'}
        </p>
      )}
      {confirmingAnonymize && (
        <ConfirmModal
          title="Borrar datos personales"
          message={`Esta acción borra de forma permanente el nombre y correo de "${user.name}". No se puede deshacer.`}
          isPending={anonymizeUser.isPending}
          error={
            anonymizeUser.isError
              ? anonymizeUser.error instanceof ApiError
                ? anonymizeUser.error.message
                : 'No se pudieron borrar los datos personales.'
              : undefined
          }
          onCancel={() => setConfirmingAnonymize(false)}
          onConfirm={() =>
            anonymizeUser.mutate(user.id, {
              onSuccess: () => setConfirmingAnonymize(false),
            })
          }
        />
      )}
    </div>
  );
}
