import pg from 'pg';

const { Pool } = pg;
const usesSsl = process.env.DATABASE_SSL === 'true';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usesSsl ? { rejectUnauthorized: false } : false
});
