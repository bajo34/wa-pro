import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './lib/env.js';
import { migrate } from './services/db.js';
import { inboxRouter } from './routes/inbox.js';
import { assignmentRouter } from './routes/assignment.js';
import { rulesRouter } from './routes/rules.js';
import { quickReplyRouter } from './routes/quickReplies.js';
import { privateNumbersRouter } from './routes/privateNumbers.js';
import { metricsRouter } from './routes/metrics.js';
import { auditRouter } from './routes/audit.js';
import { usersRouter } from './routes/users.js';
import path from 'node:path';

async function main() {
  // Run the initial migration. If it fails the process will exit and the
  // container will be restarted by the orchestrator.
  await migrate();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Basic middleware
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (!env.allowedOrigins || env.allowedOrigins.length === 0) return cb(null, true);
        return cb(null, env.allowedOrigins.includes(origin));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('combined'));

  // Serve static assets from the `public` directory. Any non-API route will fall back
  // to the client-side application. This allows a simple UI to be served alongside
  // the API without requiring a separate server.
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Optional shared-secret guard (useful for early stages before full auth).
  // If PANEL_INTERNAL_TOKEN is set, clients must send x-panel-token.
  if (env.internalToken) {
    app.use((req, res, next) => {
      if (req.path === '/api/health') return next();
      // Avoid noisy 401s for favicon requests when no icon exists in /public.
      if (req.path === '/favicon.ico') return next();
      const token = String(req.header('x-panel-token') ?? '');
      if (!token || token !== env.internalToken) {
        return res.status(401).json({ ok: false });
      }
      return next();
    });
  }

  // Health endpoint
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Mount all API routers under /api
  app.use('/api/inbox', inboxRouter);
  app.use('/api/assignment', assignmentRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/quick-replies', quickReplyRouter);
  app.use('/api/private-numbers', privateNumbersRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/users', usersRouter);

  // Catch-all handler to serve the client application for non-API routes. This needs
  // to be defined after the API routes so that API requests are matched first. Any
  // request that does not start with `/api` will be served the index.html file.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.listen(env.port, () => {
    console.log(`[panel] listening on :${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});