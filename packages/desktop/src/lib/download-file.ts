import { apiFetchBlob } from './api-client';

// El navegador no manda el header Authorization en un <a href> directo — la
// descarga pasa por apiFetchBlob (mismo auth que el resto de la app) y se
// dispara con un <a download> programático, no abriendo una ventana nueva
// (window.open cae en el manejador por defecto de Electron, que la bloquea
// sin un setWindowOpenHandler explícito).
export async function downloadFile(path: string, filename: string) {
  const blob = await apiFetchBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
