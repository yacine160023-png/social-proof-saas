import 'dotenv/config';
import http from 'node:http';
import cron from 'node-cron';
import { config } from './config.js';
import { runWeeklyAutomation } from './cron.js';

const port = Number(process.env.PORT ?? 3000);
let running = false;

async function runOnce(): Promise<void> {
  if (running) {
    console.warn('Automation already running; skipping overlapping run.');
    return;
  }
  running = true;
  try {
    await runWeeklyAutomation();
  } finally {
    running = false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'social-proof-saas' }));
    return;
  }

  if (req.url === '/api/cron' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.headers.authorization !== `Bearer ${config.cronSecret}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      await runOnce();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Automation failed' }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Every Monday at 08:00 UTC. Railway keeps this service running.
cron.schedule('0 8 * * 1', () => {
  void runOnce().catch((error) => console.error('Scheduled automation failed:', error));
}, { timezone: 'UTC' });

server.listen(port, '0.0.0.0', () => {
  console.log(`Social Proof SaaS listening on port ${port}`);
});
