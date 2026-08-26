import { KeyRound, Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateUser } from '../../hooks/useDeactivateUser';
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
// error. "Desactivar" se oculta para la propia cuenta — el backend ya lo
// bloquea (ver UsersService.deactivate), esto solo evita el viaje redondo
// de un 400 para un caso que nunca debería intentarse desde la UI.
export function UserRowActions({
  user,
  isSelf,
  onEdit,
  onResetPassword,
}: UserRowActionsProps) {
  const deactivateUser = useDeactivateUser();

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
        {user.isActive && !isSelf && (
          <Button
            variant="ghost"
            onClick={() => deactivateUser.mutate(user.id)}
            disabled={deactivateUser.isPending}
            className="px-3 py-1.5"
          >
            <UserX className="h-4 w-4" />
            {deactivateUser.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateUser.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateUser.error instanceof ApiError
            ? deactivateUser.error.message
            : 'No se pudo desactivar el usuario.'}
        </p>
      )}
    </div>
  );
}
