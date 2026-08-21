import { LayoutDashboard } from 'lucide-react';

// Placeholder — los indicadores agregados llegan en M5 (#75/#76), una vez
// existan Ventas/Compras que alimenten el dashboard. Mismo lenguaje visual
// que el vacío de DataTable (círculo + ícono + texto tenue) para que una
// pantalla sin construir se lea como "todavía no", no como rota.
function DashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="bg-chrome-strong text-ink-faint flex h-12 w-12 items-center justify-center rounded-full">
        <LayoutDashboard className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-ink text-lg font-medium">Dashboard</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Llega en M5, con los indicadores agregados de ventas y compras.
        </p>
      </div>
    </div>
  );
}

export default DashboardPage;
