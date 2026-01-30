import fetch from "node-fetch";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../lib/env.js";

export type CatalogItem = {
  id: string;
  name: string;

  // Nuevo schema
  priceNumber?: number;
  currency?: "ARS" | "USD" | string;
  priceText?: string;

  inStock?: boolean;

  url?: string;
  image?: string;

  category?: string;
  description?: string; // limpio, sin hashtags ni prefijos
  descriptionRaw?: string; // opcional, backup
};

const sample: CatalogItem[] = [
  { id: "ps5", name: "PlayStation 5 Slim", priceNumber: 999999, currency: "ARS", inStock: true, category: "consolas" },
  { id: "xbox", name: "Xbox Series X", priceNumber: 999999, currency: "ARS", inStock: true, category: "consolas" },
  { id: "headset", name: "Auriculares Gamer HyperX Cloud Stinger", priceNumber: 99999, currency: "ARS", inStock: true, category: "auriculares" },
  { id: "monitor", name: 'Monitor 24" 144Hz', priceNumber: 249999, currency: "ARS", inStock: true, category: "monitores" }
];

let cached: CatalogItem[] | null = null;
let cachedAt = 0;

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lightweight synonym handling (no LLM, low-cost).
 */
function applySynonyms(text: string): string {
  return text
    .replace(/\b(play\s*station\s*5|play\s*5|ps\s*5)\b/g, "ps5")
    .replace(/\b(play\s*station\s*4|play\s*4|ps\s*4)\b/g, "ps4")
    .replace(/\b(auris|auri|auricular(?:es)?|headset)\b/g, "auriculares")
    .replace(/\b(mando|control)\b/g, "joystick");
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "GET", signal: controller.signal as any });
    if (!r.ok) throw new Error(`CATALOG_JSON_URL fetch failed: ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function slugToTitle(slug: string) {
  const s = slug
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
    .replace(/\.(json|html?)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tryDeriveNameFromUrl(u?: string) {
  if (!u) return "";
  try {
    const url = new URL(u);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    return slugToTitle(last);
  } catch {
    const last = String(u).split("/").filter(Boolean).pop() ?? "";
    return slugToTitle(last);
  }
}

function normalizeImageUrl(image?: string, productUrl?: string): string | undefined {
  if (!image) return undefined;
  const raw = String(image).trim();
  if (!raw) return undefined;
  // Already absolute
  if (/^https?:\/\//i.test(raw)) return raw;
  // Try to resolve relative paths against product URL origin
  if (productUrl) {
    try {
      const resolved = new URL(raw, productUrl);
      return resolved.toString();
    } catch {
      // fall through
    }
  }
  // Unknown base: return as-is (Evolution may still accept it if reachable)
  return raw;
}

function stripHashtags(text: string) {
  return (text || "").replace(/#[\p{L}0-9_]+/gu, " ");
}

function stripDescriptionPrefix(text: string) {
  return (text || "").replace(/^\s*descripci[oó]n\s+del\s+producto\s*/i, "");
}

function cleanDescription(text?: string) {
  if (!text) return undefined;
  const cleaned = stripHashtags(stripDescriptionPrefix(text))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function coerceMoneyNumber(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  // ejemplo "$ 70.500,00" -> 70500
  const s = String(v).trim();
  if (!s) return undefined;

  // Si viene con miles "." y decimales "," (es-AR), convertimos bien
  // 70.500,00 -> 70500.00
  const normalized = s
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // quita separadores de miles "."
    .replace(",", "."); // decimal a "."

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function coerceBoolean(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "si", "sí", "1", "in_stock", "stock", "available"].includes(s)) return true;
    if (["false", "no", "0", "out_of_stock", "sin_stock", "unavailable"].includes(s)) return false;
  }
  return undefined;
}

async function tryLoadLocalCatalog(): Promise<any[] | null> {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Este archivo está en apps/bot/services/ -> el JSON está en apps/bot/catalog/
    const candidates = [
      path.resolve(__dirname, "../catalog/catalog.json"),
      path.resolve(__dirname, "../catalog.json"),

      // por si el cwd es repo root
      path.resolve(process.cwd(), "apps/bot/catalog/catalog.json"),
      path.resolve(process.cwd(), "apps/bot/catalog.json"),

      // por si el cwd ya es apps/bot
      path.resolve(process.cwd(), "catalog/catalog.json"),
      path.resolve(process.cwd(), "catalog.json")
    ];

    for (const p of candidates) {
      try {
        const raw = await fs.readFile(p, "utf8");
        const json = JSON.parse(raw);
        if (Array.isArray(json)) return json;
      } catch {
        // continue
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getCatalog(): Promise<CatalogItem[]> {
  const ttlMs = Number.isFinite(env.catalogCacheTtlMs) ? env.catalogCacheTtlMs : 300000;
  const timeoutMs = Number.isFinite(env.catalogFetchTimeoutMs) ? env.catalogFetchTimeoutMs : 4000;

  const now = Date.now();

  // Local first if no URL
  if (!env.catalogJsonUrl) {
    if (cached && now - cachedAt < ttlMs) return cached;

    const local = await tryLoadLocalCatalog();
    if (!local) return sample;

    try {
      const items = mapRawCatalog(local);
      cached = items;
      cachedAt = now;
      return items;
    } catch {
      return sample;
    }
  }

  if (cached && now - cachedAt < ttlMs) return cached;

  try {
    const json = (await fetchJsonWithTimeout(env.catalogJsonUrl, timeoutMs)) as any;
    if (!Array.isArray(json)) throw new Error("CATALOG_JSON_URL must return a JSON array");

    cached = mapRawCatalog(json);
    cachedAt = now;
    return cached;
  } catch {
    if (cached) return cached;
    return sample;
  }
}

function mapRawCatalog(json: any[]): CatalogItem[] {
  return json
    .map((x) => {
      const url = isNonEmptyString(x.url)
        ? x.url
        : isNonEmptyString(x.productUrl)
          ? x.productUrl
          : undefined;

      const name = isNonEmptyString(x.name)
        ? x.name
        : isNonEmptyString(x.title)
          ? x.title
          : tryDeriveNameFromUrl(url);

      const id = isNonEmptyString(x.id)
        ? x.id
        : isNonEmptyString(x.sku)
          ? x.sku
          : isNonEmptyString(x.slug)
            ? x.slug
            : name || String(url ?? "");

      const descriptionRaw = isNonEmptyString(x.descriptionRaw) ? x.descriptionRaw : isNonEmptyString(x.description) ? x.description : undefined;
      const description = cleanDescription(isNonEmptyString(x.description) ? x.description : descriptionRaw);

      const priceNumber =
        coerceMoneyNumber(x.priceNumber) ??
        coerceMoneyNumber(x.priceArs) ?? // compat viejo
        coerceMoneyNumber(x.price) ??
        coerceMoneyNumber(x.price_ars) ??
        coerceMoneyNumber(x.precio) ??
        undefined;

      const priceText = isNonEmptyString(x.priceText) ? x.priceText : isNonEmptyString(x.priceFormatted) ? x.priceFormatted : undefined;
      const currency = isNonEmptyString(x.currency) ? x.currency : (priceNumber !== undefined ? "ARS" : undefined);

      const rawImage = isNonEmptyString(x.image) ? x.image : isNonEmptyString(x.imageUrl) ? x.imageUrl : undefined;
      const image = normalizeImageUrl(rawImage, url);
      const category = isNonEmptyString(x.category) ? x.category : undefined;

      const inStock =
        coerceBoolean(x.inStock) ??
        coerceBoolean(x.stock) ?? // si algún día ponés stock number, esto lo toma como boolean
        undefined;

      return {
        id: String(id),
        name: String(name ?? "").trim(),
        url,
        image,
        category,
        description,
        descriptionRaw,
        priceNumber,
        priceText,
        currency,
        inStock
      } as CatalogItem;
    })
    .filter((x) => x.id && x.name)
    // si querés filtrar sin stock acá:
    .filter((x) => x.inStock !== false);
}

export function searchCatalog(items: CatalogItem[], q: string, limit = 5): CatalogItem[] {
  const query = applySynonyms(normalizeText(q));
  if (!query) return [];

  const tokens = query.split(/\s+/).filter(Boolean);

  const scored = items
    .map((item) => {
      // (Opcional) si querés excluir sin stock también en search:
      if (item.inStock === false) return { item, score: 0 };

      const hay = applySynonyms(
        normalizeText(
          `${item.id} ${item.name} ${item.category ?? ""} ${item.url ?? ""} ${item.description ?? ""}`
        )
      );

      let score = 0;

      // boost fuerte por match en name
      const nameHay = applySynonyms(normalizeText(item.name));
      for (const t of tokens) {
        if (nameHay.includes(t)) score += 5;
        else if (hay.includes(t)) score += 2;

        if (t.length >= 4) {
          const prefix = t.slice(0, Math.min(6, t.length));
          if (nameHay.includes(prefix)) score += 2;
          else if (hay.includes(prefix)) score += 1;
        }
      }

      if (hay.includes(query)) score += 2;
      if (hay.includes(` ${query} `)) score += 1;

      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);

  return scored;
}

export function formatItemLine(item: CatalogItem, idx: number) {
  const price =
    typeof item.priceNumber === "number"
      ? `— ${item.currency ?? "ARS"} ${Number(item.priceNumber).toLocaleString("es-AR")}`
      : item.priceText
        ? `— ${item.priceText}`
        : "";

  const url = item.url ? `\n${item.url}` : "";
  return `${idx}) ${item.name} ${price}`.trim() + url;
}
