import { z } from 'zod';

/**
 * Parses and validates environment variables for the panel service. This module
 * centralises all runtime configuration. It follows the pattern used in the
 * existing bot service so that future maintainers have a familiar API.
 */
export const env = (() => {
  // Define the schema using zod. Optional values are allowed but have
  // sensible defaults applied below.
  const schema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    EVOLUTION_API_URL: z.string().url().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    EVOLUTION_INSTANCE: z.string().optional(),
    BOT_API_URL: z.string().url().optional(),
    BOT_ADMIN_TOKEN: z.string().optional(),
    PANEL_ALLOWED_ORIGINS: z.string().optional(),
    PANEL_INTERNAL_TOKEN: z.string().optional()
  });

  const parsed = schema.parse(process.env);
  return {
    nodeEnv: parsed.NODE_ENV ?? 'production',
    port: Number(parsed.PORT ?? '3001'),
    databaseUrl: parsed.DATABASE_URL,
    evolutionUrl: parsed.EVOLUTION_API_URL?.replace(/\/$/, '') || '',
    evolutionApiKey: parsed.EVOLUTION_API_KEY || '',
    instanceName: parsed.EVOLUTION_INSTANCE || '',
    botApiUrl: parsed.BOT_API_URL?.replace(/\/$/, '') || '',
    botAdminToken: parsed.BOT_ADMIN_TOKEN || '',
    allowedOrigins: (parsed.PANEL_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    internalToken: parsed.PANEL_INTERNAL_TOKEN || ''
  };
})();