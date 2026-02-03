import { pool } from './db.js';
import { env } from '../lib/env.js';

export type VehicleRow = {
  id: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  km?: number | null;
  price?: any;
  currency?: string | null;
  slug?: string | null;
  permalink?: string | null;
};

function coerceMoneyNumber(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const normalized = s
    .replace(/[^\d.,-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function formatPrice(price: any, currency?: string | null): string {
  const n = coerceMoneyNumber(price);
  if (n === undefined) return 'a consultar';

  const c = (currency ?? '').toUpperCase();
  const isUsd = c.includes('USD') || c.includes('U$') || c.includes('US');

  // es-AR formatting
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0
  }).format(Math.round(n));

  if (isUsd) return `USD ${formatted}`;
  if (c) return `${c} ${formatted}`;
  return `$ ${formatted}`;
}

export async function getVehicleById(vehicleId: string): Promise<VehicleRow | null> {
  const q = `
    select id, title, brand, model, year, km, price, currency, slug, permalink
    from public.vehicles
    where id = $1
    ${env.catalogDealershipId ? 'and dealership_id = $2' : ''}
    limit 1
  `;

  const params = env.catalogDealershipId ? [vehicleId, env.catalogDealershipId] : [vehicleId];
  const { rows } = await pool.query(q, params);
  return rows[0] ?? null;
}

export async function getVehicleBySlug(slug: string): Promise<VehicleRow | null> {
  const q = `
    select id, title, brand, model, year, km, price, currency, slug, permalink
    from public.vehicles
    where slug = $1
    ${env.catalogDealershipId ? 'and dealership_id = $2' : ''}
    limit 1
  `;

  const params = env.catalogDealershipId ? [slug, env.catalogDealershipId] : [slug];
  const { rows } = await pool.query(q, params);
  return rows[0] ?? null;
}

export function buildVehicleUrl(v: VehicleRow): string | undefined {
  if (v.permalink) return v.permalink;
  if (env.publicCatalogBaseUrl && v.slug) {
    return `${env.publicCatalogBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(v.slug)}`;
  }
  return undefined;
}

export function vehicleTitle(v: VehicleRow): string {
  const fromTitle = v.title?.trim();
  if (fromTitle) return fromTitle;
  const bits = [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean);
  return bits.length ? String(bits.join(' ')) : 'Vehículo';
}
