// Placeholder — sin issue dedicada todavía. Existe para demostrar que la
// navegación por rol (#41) filtra correctamente: solo ADMIN ve este ítem
// en el sidebar, y el propio backend (GET/POST /users) ya es ADMIN-only
// desde M1 (#13) — falta la pantalla real que lo consuma.
function UsersPage() {
  return (
    <div>
      <h1 className="text-ink text-xl font-medium">Usuarios</h1>
      <p className="text-ink-muted mt-1 text-sm">
        Pendiente — sin issue dedicada todavía.
      </p>
    </div>
  );
}

export default UsersPage;
