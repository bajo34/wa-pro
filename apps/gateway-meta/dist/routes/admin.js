import { env } from '../lib/env.js';
import { upsertMapping, listMappings, getMappedVehicleId } from '../services/publicationMap.js';
function assertAdmin(req) {
    const token = req.headers['x-admin-token'] ?? '';
    if (token !== env.adminToken) {
        const e = new Error('Unauthorized');
        e.status = 401;
        throw e;
    }
}
export async function adminUpsertMapping(req, res) {
    assertAdmin(req);
    const { platform, mediaId, vehicleId } = req.body ?? {};
    if (!platform || !mediaId || !vehicleId) {
        return res.status(400).json({ error: 'platform, mediaId, vehicleId are required' });
    }
    await upsertMapping(platform, String(mediaId), String(vehicleId));
    res.json({ ok: true });
}
export async function adminGetMapping(req, res) {
    assertAdmin(req);
    const platform = String(req.query.platform ?? 'IG');
    const mediaId = String(req.query.mediaId ?? '');
    if (!mediaId)
        return res.status(400).json({ error: 'mediaId is required' });
    const vehicleId = await getMappedVehicleId(platform, mediaId);
    res.json({ platform, mediaId, vehicleId });
}
export async function adminListMappings(req, res) {
    assertAdmin(req);
    const platform = String(req.query.platform ?? 'IG');
    const limit = Number(req.query.limit ?? '200');
    const rows = await listMappings(platform, Number.isFinite(limit) ? limit : 200);
    res.json({ platform, count: rows.length, rows });
}
//# sourceMappingURL=admin.js.map