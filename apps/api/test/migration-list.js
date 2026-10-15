import { readdirSync } from 'node:fs';

/** Todas as migrações .sql do projeto, em ordem. Os testes usam isto em vez de listas fixas. */
export const ALL_MIGRATIONS = readdirSync(new URL('../migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
