import { z } from 'zod';
const boolFromString = (v, def) => {
    if (v === undefined)
        return def;
    return v === 'true' || v === '1' || v === 'yes';
};
export const env = (() => {
    const schema = z.object({
        NODE_ENV: z.string().optional(),
        PORT: z.string().optional(),
        // Webhooks / security
        META_VERIFY_TOKEN: z.string().min(6),
        META_APP_SECRET: z.string().min(8),
        META_ADMIN_TOKEN: z.string().min(6),
        // Meta Graph
        META_GRAPH_VERSION: z.string().optional(),
        META_PAGE_ID: z.string().min(1),
        META_PAGE_ACCESS_TOKEN: z.string().min(10),
        // Optional (some endpoints like media fetch can use this)
        IG_BUSINESS_ACCOUNT_ID: z.string().optional(),
        // Catalog (vehicles)
        DATABASE_URL: z.string().min(1),
        CATALOG_DEALERSHIP_ID: z.string().uuid().optional(),
        // Behavior
        META_VALIDATE_SIGNATURE: z.string().optional(),
        META_KEYWORDS: z.string().optional(),
        // Optional: base URL to your web catalog
        PUBLIC_CATALOG_BASE_URL: z.string().url().optional()
    });
    const parsed = schema.parse(process.env);
    return {
        nodeEnv: parsed.NODE_ENV ?? 'production',
        port: Number(parsed.PORT ?? '3000'),
        verifyToken: parsed.META_VERIFY_TOKEN,
        appSecret: parsed.META_APP_SECRET,
        adminToken: parsed.META_ADMIN_TOKEN,
        graphVersion: parsed.META_GRAPH_VERSION ?? 'v24.0',
        pageId: parsed.META_PAGE_ID,
        pageAccessToken: parsed.META_PAGE_ACCESS_TOKEN,
        igBusinessAccountId: parsed.IG_BUSINESS_ACCOUNT_ID ?? undefined,
        databaseUrl: parsed.DATABASE_URL,
        catalogDealershipId: parsed.CATALOG_DEALERSHIP_ID ?? undefined,
        validateSignature: boolFromString(parsed.META_VALIDATE_SIGNATURE, true),
        keywords: (parsed.META_KEYWORDS ?? 'info,precio,financiacion,financiación,cuotas,plan,stock,disponible')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0),
        publicCatalogBaseUrl: parsed.PUBLIC_CATALOG_BASE_URL ?? undefined
    };
})();
//# sourceMappingURL=env.js.map