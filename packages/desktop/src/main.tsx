import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initAuthToken } from './lib/auth-token';
import { initTheme } from './lib/theme';

// Antes de montar React — evita un parpadeo visible del tema equivocado.
initTheme();

// Hidrata el cache del token desde `safeStorage` (IPC async) antes de
// montar. La garantía real contra la carrera con `createHashRouter`
// (dispara su loader inicial al crearse, en el import de arriba, antes
// de que este await corra) vive en los loaders de router.tsx, que
// esperan la misma promesa memoizada — esto solo evita un flash de UI
// mientras esa hidratación está en curso.
void (async () => {
  await initAuthToken();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
