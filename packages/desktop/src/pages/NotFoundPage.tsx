import { Link } from 'react-router';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-ink text-3xl font-medium">404</h1>
      <p className="text-ink-muted">Esta página no existe.</p>
      <Link to="/" className="text-accent underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export default NotFoundPage;
