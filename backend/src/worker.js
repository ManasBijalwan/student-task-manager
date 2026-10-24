import { httpServerHandler } from 'cloudflare:node';
import app, { configureClientOrigin } from './app.js';
import { configureDatabase } from './db.js';
import { maintainRecurringHorizon } from './services/recurringTasks.js';

const port = 3000;
app.listen(port);
const expressHandler = httpServerHandler({ port });

function configureRuntime(env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('The HYPERDRIVE binding is missing. Configure it in the Worker settings.');
  }
  configureDatabase(env.HYPERDRIVE.connectionString, { worker: true });
  configureClientOrigin(env.CLIENT_URL);
}

export default {
  async fetch(request, env, ctx) {
    configureRuntime(env);
    return expressHandler.fetch(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    configureRuntime(env);
    ctx.waitUntil(maintainRecurringHorizon());
  }
};
