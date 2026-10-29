# Bayani Wearable SOS — Hardware Integration (pointer)

The wearable (ESP32-S3 + SIMCom A7670E) does not talk to this app. It posts to the
Bayani backend over HTTPS, and this app renders the incident the backend stored.

**Full reference — device registration, payload, retries, manual test procedure:**
[`bayani-alert/docs/HARDWARE_INTEGRATION.md`](../../bayani-alert/docs/HARDWARE_INTEGRATION.md)

## What this app does with a band press

* Subscribes to `/stream` with the citizen's session token, reconnecting whenever
  the session changes, so presses that arrive while the app is closed are shown
  on the next login.
* Renders the stored incident as the active emergency plus a
  "SOS from your wearable" notification.
* **Never re-transmits it** — no `POST /event`, no offline queue entry, no attempt
  to send from the phone.
* Does **not** let the phone's live GPS overwrite the wearable's coordinates.

## Quick smoke test

With the backend and this app running, and `DEVICE_BA_001_*` configured in
`bayani-alert/.env`:

```bash
curl -X POST http://localhost:8000/device/sos \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: $DEVICE_BA_001_KEY" \
  -d '{"deviceId":"BA-001","event":"SOS","latitude":14.6781,"longitude":120.5439,
       "timestamp":"2026-10-02T09:15:30.000Z","eventId":"squeeze-000042"}'
```

Repeat the identical request — the same `incidentId` comes back with
`"duplicate": true` and no second emergency appears.

## Pointing this app at a backend on another machine

```bash
# bayani-app/.env
VITE_BRIDGE_URL=http://192.168.1.5:8000
```

Restart the dev server after changing it, and add the app's origin to
`CORS_ORIGINS` in `bayani-alert/.env`.