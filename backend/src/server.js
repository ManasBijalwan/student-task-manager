import 'dotenv/config';
import { pool } from './db.js';
import app from './app.js';
import { maintainRecurringHorizon } from './services/recurringTasks.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set in backend/.env or the process environment.');
  process.exit(1);
}

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`API ready at http://localhost:${port}`));

const backgroundWorker = setInterval(() => {
  maintainRecurringHorizon().catch((error) => console.error('Recurring task scheduling failed:', error));
}, 30_000);
backgroundWorker.unref();
maintainRecurringHorizon().catch((error) => console.error('Initial recurring task scheduling failed:', error));

async function shutdown() { await pool.end(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
