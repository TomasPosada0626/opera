import { Users } from 'lucide-react';

// Placeholder — sin issue dedicada todavía. Existe para demostrar que la
// navegación por rol (#41) filtra correctamente: solo ADMIN ve este ítem
// en el sidebar, y el propio backend (GET/POST /users) ya es ADMIN-only
// desde M1 (#13) — falta la pantalla real que lo consuma. Mismo lenguaje
// visual que el vacío de Dashboard/DataTable (círculo + ícono + texto
// tenue), no el bloque de texto plano alineado a la izquierda de antes —
// una pantalla sin construir debe leerse igual de cuidada que una vacía.
function UsersPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="bg-chrome-strong text-ink-faint flex h-12 w-12 items-center justify-center rounded-full">
        <Users className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-ink text-lg font-medium">Usuarios</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Aún no disponible — el backend ya soporta CRUD de usuarios, falta la
          pantalla.
        </p>
      </div>
    </div>
  );
}

export default UsersPage;
