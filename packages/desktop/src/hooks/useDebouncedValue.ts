import { useEffect, useState } from 'react';

// Evita disparar una request por cada tecla en el buscador de #42 — espera
// a que el usuario deje de escribir antes de propagar el valor.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
