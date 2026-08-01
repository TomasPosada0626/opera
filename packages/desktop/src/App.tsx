import { useEffect, useState } from 'react';

function App() {
  const [mainProcessMessage, setMainProcessMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    window.ipcRenderer?.on(
      'main-process-message',
      (_event, message: string) => {
        setMainProcessMessage(message);
      },
    );
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 text-slate-100">
      <h1 className="text-3xl font-bold">Opera</h1>
      <p className="text-slate-400">Electron + React + Vite + Tailwind CSS</p>
      {mainProcessMessage && (
        <p className="text-xs text-slate-600">
          main process: {mainProcessMessage}
        </p>
      )}
    </div>
  );
}

export default App;
