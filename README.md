# WA Pro MVP (Evolution API + Whaticket Panel)

Objetivo: **MVP vendible** con **solo WhatsApp** usando **Evolution API (Baileys)** para la conexión y **Whaticket** como panel (UI/UX pro) para Inbox, tickets, agentes, colas, notas, etc.

Este repo deja 1 stack coherente de 3 piezas:

- **apps/evolution-api**: servidor Evolution API (WhatsApp Baileys)
- **apps/evolution-manager**: UI de Evolution (opcional, para ver instancias)
- **apps/panel-whaticket**: panel pro (frontend + backend) **modificado** para usar Evolution

> Si ya tenés Evolution API desplegado en Railway, podés **no** deployar `apps/evolution-api` y apuntar el panel a tu deploy existente.

---

## Arquitectura (simple)

- Panel (Whaticket) guarda **Contactos/Tickets/Mensajes** en Postgres.
- Evolution API se encarga de **conectar WhatsApp** y **mandar/recibir**.
- Panel se integra por:
  - **API calls** a Evolution para: connect/qr, sendText, sendMedia
  - **Webhook** de Evolution hacia el backend del panel para: mensajes entrantes (MESSAGES_UPSERT)

---

## Variables de entorno (Railway)

### Panel Backend (`apps/panel-whaticket/backend`)

**Base** (Whaticket):
- `FRONTEND_URL` = URL del frontend (Vite)
- `BACKEND_URL` = URL pública del backend (IMPORTANTE para media + webhooks)
- `JWT_SECRET` = secreto
- `JWT_REFRESH_SECRET` = secreto

**DB (Sequelize):**
- `DB_DIALECT=postgres`
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_PORT`

**Proveedor WhatsApp (nuevo):**
- `WHATSAPP_PROVIDER=EVOLUTION`
- `EVOLUTION_API_URL=https://<tu-evolution-api>.up.railway.app`
- `EVOLUTION_API_KEY=<apikey>`
- `EVOLUTION_WEBHOOK_SECRET=<string-largo>`
- `EVOLUTION_POLL_MS=3000` (opcional)

### Panel Frontend (`apps/panel-whaticket/frontend`)

- `VITE_BACKEND_URL=https://<tu-backend>.up.railway.app`

### Evolution API (`apps/evolution-api`) (si lo deployás)

- Configurá `AUTHENTICATION.API_KEY` / `apikey` según tu repo/config de Evolution.
- Asegurate que el panel tenga ese `EVOLUTION_API_KEY`.

---

## Conexión WhatsApp (desde el panel)

1) Entrá a **Connections**.
2) Creá una conexión WhatsApp.
3) **IMPORTANTE:** el campo **Name** es el `instanceName` de Evolution.
   - Ej: `sector7` o `jda-colectora`
4) Click **QR Code**.

El backend va a:
- crear la instancia si no existe (`/instance/create`) registrando webhook al panel
- pedir el QR (`/instance/connect/:instanceName`)
- mantener estado/QR actualizado con polling (`/instance/connectionState/:instanceName`)

---

## Qué se cambió (para hacerlo “pro”)

- ✅ Soporte **Evolution** sin romper el provider original (whatsapp-web.js)
- ✅ Envío de **texto** por Evolution + creación del mensaje en DB (para que se vea en el panel)
- ✅ Envío de **media** por Evolution usando `/public/<file>` + creación del mensaje en DB
- ✅ Webhook `/webhooks/evolution/:instanceName` para **mensajes entrantes**
- ✅ Poller de estado para mostrar **qrcode / connected / disconnected** en UI
- ✅ Delete message en modo Evolution: solo marca `isDeleted` (sin borrar remoto)

---

## Notas de operación

- El webhook acepta token por **header** `x-evolution-secret` o por **query** `?token=...`.
- Para que el envío de media funcione, `BACKEND_URL` debe ser público y `/public` accesible.

---

## Siguientes upgrades (si querés que quede enterprise)

- Descargar media entrante desde Evolution y guardar en `/public` para ver imágenes recibidas.
- Reglas de handoff (BOT_ON / HUMAN_ONLY) por contacto + panel de control.
- Multi-tenant real (Whaticket base es single-company).
