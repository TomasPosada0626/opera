import { getAuthToken } from './auth-token';

// En dev, el backend corre en localhost:3000 (ver packages/backend). Se
// puede sobreescribir con VITE_API_URL si algún día el backend no vive en
// la misma máquina.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Forma de error que devuelve el ValidationPipe/filtro de excepciones de
// Nest por defecto — message puede ser un string o un array (errores de
// validación de class-validator).
interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return Array.isArray(body.message) ? body.message.join(', ') : body.message;
  } catch {
    return response.statusText;
  }
}

async function authorizedFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  return response;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authorizedFetch(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Para respuestas binarias (el PDF de una remisión, #54) — mismo manejo de
// auth/errores que apiFetch, pero sin el .json() final que rompería un PDF.
export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  const response = await authorizedFetch(path, options);
  return response.blob();
}
