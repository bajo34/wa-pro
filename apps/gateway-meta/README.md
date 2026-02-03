# gateway-meta (IG + FB)

Servicio HTTP para recibir webhooks de Meta (Instagram/Facebook) y disparar respuestas automáticas.

## Endpoints

- `GET /health`
- `GET /webhooks/meta` (verify)
- `POST /webhooks/meta` (receiver)

Admin (header `X-Admin-Token: <META_ADMIN_TOKEN>`):

- `POST /admin/map` `{ platform: "IG"|"FB", mediaId: "...", vehicleId: "..." }`
- `GET /admin/map?platform=IG&mediaId=...`
- `GET /admin/maps?platform=IG&limit=200`

## MVP flow

Cuando entra un comentario que contenga keywords (ej: `info`, `precio`):

1) Responde público (best-effort): "Te mando la info por DM ✅"
2) Envía **private reply** al comentarista con el precio del vehículo.

Para que el precio sea correcto, mapeá cada publicación (`mediaId`) con un `vehicleId`.

## Mapping recomendado

- Persistente: tabla `public.meta_publication_map` (se crea sola al iniciar el servicio)
- Rápido: `META_PUBLICATION_MAP_JSON` (sin DB)
