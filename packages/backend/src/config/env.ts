import { config } from 'dotenv';
import { resolve } from 'path';

// Un solo .env en la raíz del monorepo, compartido con docker-compose (ver .env.example).
// Se carga aquí, antes de cualquier otro import, porque PrismaClient lee DATABASE_URL
// al conectarse y el orden de inicialización de módulos de Nest no lo garantiza.
config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
