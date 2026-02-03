import { z } from 'zod';

const boolFromString = (v: string | undefined, def: boolean) => {
  if (v === undefined) return def;
  return v === 'true' || v === '1' || v === 'yes';
};

export const env = (() => {
  const schema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: z.string().optional(),
    BOT_PUBLIC_URL: z.string().url().optional(),
    BOT_WEBHOOK_SECRET: z.string().min(6),
    BOT_ADMIN_TOKEN: z.string().min(6),
    EVOLUTION_API_URL: z.string().url(),
    EVOLUTION_API_KEY: z.string().min(8),
    EVOLUTION_INSTANCE: z.string().min(1),
    BOT_INBOUND_ONLY: z.string().optional(),
    BOT_COOLDOWN_MS: z.string().optional(),
    // Can be an http(s) URL or a local path inside the bot service (e.g. ./catalog/catalog.json)
    CATALOG_JSON_URL: z.string().optional(),
    // Optional filter: only show vehicles for a given dealership (uuid)
    CATALOG_DEALERSHIP_ID: z.string().uuid().optional(),
    DATABASE_URL: z.string().min(1)
  });

  const parsed = schema.parse(process.env);
  return {
    nodeEnv: parsed.NODE_ENV ?? 'production',
    port: Number(parsed.PORT ?? '3000'),
    publicUrl: parsed.BOT_PUBLIC_URL,
    webhookSecret: parsed.BOT_WEBHOOK_SECRET,
    adminToken: parsed.BOT_ADMIN_TOKEN,
    evolutionUrl: parsed.EVOLUTION_API_URL.replace(/\/$/, ''),
    evolutionApiKey: parsed.EVOLUTION_API_KEY,
    instanceName: parsed.EVOLUTION_INSTANCE,
    inboundOnly: boolFromString(parsed.BOT_INBOUND_ONLY, true),
    cooldownMs: Number(parsed.BOT_COOLDOWN_MS ?? '1000'),
    catalogJsonUrl: parsed.CATALOG_JSON_URL || undefined,
    catalogDealershipId: parsed.CATALOG_DEALERSHIP_ID || undefined,
    databaseUrl: parsed.DATABASE_URL,
    /**
     * Humanizer settings. These values control how long the bot waits before
     * aggregating multiple incoming messages into a single reply and how it
     * simulates a human typing delay. All values are expressed in
     * milliseconds and are tunable via environment variables. Sensible
     * defaults are provided so the bot remains functional without
     * configuration.
     */
    // Minimum debounce window before processing user messages (e.g. 2500ms)
    humanizerMinMs: Number(process.env.BOT_HUMANIZER_MIN_MS ?? '2500'),
    // Maximum debounce window before processing user messages (e.g. 4000ms)
    humanizerMaxMs: Number(process.env.BOT_HUMANIZER_MAX_MS ?? '4000'),
    // Base delay range to simulate thinking/typing before replying (e.g. 800–2500ms)
    delayBaseMinMs: Number(process.env.BOT_DELAY_BASE_MIN_MS ?? '800'),
    delayBaseMaxMs: Number(process.env.BOT_DELAY_BASE_MAX_MS ?? '2500'),
    // Additional delay per character in the reply (e.g. 20–60ms per character)
    delayCharMinMs: Number(process.env.BOT_DELAY_PER_CHAR_MIN_MS ?? '20'),
    delayCharMaxMs: Number(process.env.BOT_DELAY_PER_CHAR_MAX_MS ?? '60'),
    // Cooldown for repeating fallback messages (default 5 minutes)
    fallbackCooldownMs: Number(process.env.BOT_FALLBACK_COOLDOWN_MS ?? String(5 * 60 * 1000)),
    // Comma separated list of admin/test phone numbers (optional)
    testNumbers: (process.env.BOT_TEST_NUMBERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),

    // Comma separated list of numbers that the bot must NOT handle.
    // These are treated as HUMAN_ONLY (no automatic replies).
    privateNumbers: (process.env.BOT_PRIVATE_NUMBERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    // Debug logs
    debugWebhooks: boolFromString(process.env.DEBUG_WEBHOOKS, false),
    // Optionally split long multi-line replies into two messages
    splitReplies: boolFromString(process.env.BOT_SPLIT_REPLIES, false),
    splitRepliesProb: Number(process.env.BOT_SPLIT_REPLIES_PROB ?? '0.25'),
    // Catalog caching & fetch
    catalogCacheTtlMs: Number(process.env.CATALOG_CACHE_TTL_MS ?? String(5 * 60 * 1000)),
    catalogFetchTimeoutMs: Number(process.env.CATALOG_FETCH_TIMEOUT_MS ?? '4000'),
    // Evolution API request timeout
    evolutionFetchTimeoutMs: Number(process.env.EVOLUTION_FETCH_TIMEOUT_MS ?? '8000')
  };
})();
