import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Geist empaquetada localmente (woff2 dentro del bundle, sin pedir nada a
// internet — Opera es LAN-only y la CSP solo permite font-src 'self').
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { initAuthToken } from './lib/auth-token';
import { initErrorLogging } from './lib/error-logging';
import { initTheme } from './lib/theme';

// Antes de montar React — evita un parpadeo visible del tema equivocado.
initTheme();
initErrorLogging();

// Hidrata el cache del token desde `safeStorage` (IPC async) antes de
// montar. Los loaders de router.tsx igual esperan la misma promesa
// memoizada (el router se crea recién cuando App lo monta, ver
// getRouter) — esto solo evita un flash de UI mientras esa hidratación
// está en curso.
void (async () => {
  await initAuthToken();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
