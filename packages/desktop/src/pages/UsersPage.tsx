import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ResetPasswordForm } from '../components/users/ResetPasswordForm';
import { UserForm } from '../components/users/UserForm';
import { UserRowActions } from '../components/users/UserRowActions';
import { useUsers } from '../hooks/useUsers';
import { getCurrentUser } from '../lib/current-user';
import type { User } from '../types/user';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

function UsersPage() {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const currentUserId = getCurrentUser()?.sub;

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  function openCreateModal() {
    setEditingUser(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingUser(null);
  }

  const columns: DataTableColumn<User>[] = [
    { key: 'name', header: 'Nombre', render: (user) => user.name },
    { key: 'email', header: 'Correo', render: (user) => user.email },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length === 0 ? (
          '—'
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.roles.map(({ role }) => (
              <Badge key={role.id} variant="success">
                {role.name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (user) =>
        user.isActive ? (
          <Badge variant="success">Activo</Badge>
        ) : (
          <Badge variant="danger">Inactivo</Badge>
        ),
    },
    {
      key: 'createdAt',
      header: 'Creado',
      render: (user) => formatDate(user.createdAt),
    },
    {
      key: 'action',
      header: '',
      className: 'text-right',
      render: (user) => (
        <UserRowActions
          user={user}
          isSelf={user.id === currentUserId}
          onEdit={openEditModal}
          onResetPassword={setResettingUser}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Usuarios</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Cuentas con acceso a Opera y sus roles.
          </p>
        </div>
        <Button onClick={openCreateModal} className="shrink-0">
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(user) => user.id}
        isLoading={usersQuery.isLoading}
        emptyMessage="No hay usuarios registrados."
      />

      {isFormModalOpen && (
        <Modal
          title={editingUser ? 'Editar usuario' : 'Nuevo usuario'}
          onClose={closeFormModal}
        >
          <UserForm
            user={editingUser ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}

      {resettingUser && (
        <Modal
          title={`Resetear contraseña — ${resettingUser.name}`}
          onClose={() => setResettingUser(null)}
        >
          <ResetPasswordForm
            userId={resettingUser.id}
            onSuccess={() => setResettingUser(null)}
          />
        </Modal>
      )}
    </div>
  );
}

export default UsersPage;
