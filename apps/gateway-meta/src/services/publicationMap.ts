import { pool } from './db.js';

export type Platform = 'IG' | 'FB';

export type PublicationMapRow = {
  platform: Platform;
  media_id: string;
  vehicle_id: string;
};

export async function getMappedVehicleId(platform: Platform, mediaId: string): Promise<string | null> {
  const { rows } = await pool.query<PublicationMapRow>(
    'select platform, media_id, vehicle_id from public.meta_publication_map where platform=$1 and media_id=$2 limit 1',
    [platform, mediaId]
  );
  return rows[0]?.vehicle_id ?? null;
}

export async function upsertMapping(platform: Platform, mediaId: string, vehicleId: string): Promise<void> {
  await pool.query(
    `insert into public.meta_publication_map (platform, media_id, vehicle_id)
     values ($1, $2, $3)
     on conflict (platform, media_id)
     do update set vehicle_id = excluded.vehicle_id, updated_at = now()`,
    [platform, mediaId, vehicleId]
  );
}

export async function listMappings(platform: Platform, limit = 200): Promise<PublicationMapRow[]> {
  const { rows } = await pool.query<PublicationMapRow>(
    'select platform, media_id, vehicle_id from public.meta_publication_map where platform=$1 order by updated_at desc limit $2',
    [platform, limit]
  );
  return rows;
}
