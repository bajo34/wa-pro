import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import { env } from './lib/env.js';
import { migrate } from './services/db.js';
import { metaWebhookReceiver, metaWebhookVerify } from './routes/webhooks.js';
import { adminUpsertMapping, adminGetMapping, adminListMappings } from './routes/admin.js';

const app = express();

// Capture raw body for Meta signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(morgan('combined'));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Meta webhook
app.get('/webhooks/meta', metaWebhookVerify);
app.post('/webhooks/meta', metaWebhookReceiver);

// Admin mapping helpers (X-Admin-Token)
app.post('/admin/map', adminUpsertMapping);
app.get('/admin/map', adminGetMapping);
app.get('/admin/maps', adminListMappings);

app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err?.status ?? 500;
  res.status(status).json({ error: err?.message ?? 'Internal error' });
});

async function main() {
  // Ensure mapping table exists (safe to run repeatedly)
  await migrate();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`gateway-meta listening on :${env.port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('fatal', e);
  process.exit(1);
});
