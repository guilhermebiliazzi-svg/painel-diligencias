// Pool de conexões Postgres. Compartilhado entre rotas da API.
// O Next.js em desenvolvimento recria módulos a cada reload — guardar o pool
// em globalThis evita abrir conexão demais e esgotar o limite do Supabase.

import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Supabase exige SSL. O pooler usa cert auto-assinado — não validar.
    ssl: { rejectUnauthorized: false },
    // Pool pequeno: Vercel serverless reusa containers pouco tempo, e a
    // role painel_looker não precisa de muito throughput pra um dashboard.
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool =
  global.__pgPool ?? (global.__pgPool = createPool());
