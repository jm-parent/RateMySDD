import { loadConfig } from './server/config.js';
import { startServer } from './server/index.js';

await startServer(loadConfig(), {
  host: process.env.VERCEL ? '0.0.0.0' : '127.0.0.1',
});