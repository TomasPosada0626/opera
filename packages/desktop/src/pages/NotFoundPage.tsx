import { Link } from 'react-router';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-slate-400">Esta página no existe.</p>
      <Link to="/" className="text-slate-300 underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export default NotFoundPage;
