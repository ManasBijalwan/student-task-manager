import pg from 'pg';

const { Client, Pool } = pg;
let configuredConnectionString;
let activePool;
let cloudflareMode = false;

function createCloudflareDatabase(connectionString) {
  async function withClient(callback) {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }

  return {
    query: (...args) => withClient((client) => client.query(...args)),
    async connect() {
      const client = new Client({ connectionString });
      await client.connect();
      return {
        query: (...args) => client.query(...args),
        release() { return client.end(); }
      };
    },
    async end() {}
  };
}

export function configureDatabase(connectionString, { worker = false, ssl = false } = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required.');
  if (configuredConnectionString === connectionString && cloudflareMode === worker) return;

  configuredConnectionString = connectionString;
  cloudflareMode = worker;
  activePool = worker
    ? createCloudflareDatabase(connectionString)
    : new Pool({ connectionString, ssl });
}

function getDatabase() {
  if (!activePool) {
    configureDatabase(process.env.DATABASE_URL, {
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
  }
  return activePool;
}

// Keep the existing query/connect API for routes, while creating short-lived
// pg Clients in Workers (Hyperdrive owns the connection pool there).
export const pool = {
  query(...args) { return getDatabase().query(...args); },
  connect(...args) { return getDatabase().connect(...args); },
  end(...args) { return activePool?.end(...args) ?? Promise.resolve(); }
};
