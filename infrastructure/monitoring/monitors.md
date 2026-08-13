# Uptime & alerting — E17-T06

## Monitors

Configured in Uptime Kuma (`http://127.0.0.1:3103` over an SSH tunnel — it is
not on the public internet on purpose).

| Monitor | URL | Interval | Retries | Why |
|---|---|---|---|---|
| API ready | `https://api.curhatdong.com/v1/health/ready` | 60s | 2 | Checks Postgres **and** Redis. This is the one that matters. |
| API live | `https://api.curhatdong.com/v1/health/live` | 60s | 3 | Separates "process died" from "dependency died" — different fixes at 3am. |
| Web | `https://curhatdong.com/` | 120s | 3 | The landing page is static; if it fails, Caddy or the container is gone. |
| Admin | `https://admin.curhatdong.com/` | 300s | 3 | Nobody is blocked at 3am by admin being down, so it alerts more slowly. |
| Certificate expiry | all three hosts | daily | — | Caddy renews automatically; this catches the renewal that did not. |

**`ready` is the alerting monitor, `live` is the diagnosing one.** A ready check
that fails while live passes means the API is up and cannot reach its database —
which is a completely different night from the process being dead.

## Retry counts are not decoration

Two retries at 60 seconds means an alert fires after ~3 minutes of real failure.
A single-retry monitor pages somebody for one dropped packet, and the third time
that happens the alert stops being read — which is the actual failure mode of
monitoring, not missing an outage.

## Alerts

Telegram, to the ops group. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` already
exist in the server env schema (`packages/config/src/env/schema.ts`).

The channel has to be one somebody actually reads. An alert into a channel
nobody opens is worse than no alert: it creates the belief that somebody would
have been told.

**Alert content carries no user data** — host, monitor name, status, duration.
Never a request body, never a path with an id in it (non-negotiable #3).

## Manual setup steps

1. `ssh -L 3103:127.0.0.1:3103 user@vps`, open `http://127.0.0.1:3103`.
2. Create the admin account (first visit only) and store the password in the
   team password manager, not in this repo.
3. Add the five monitors above.
4. Notifications → Telegram → bot token + chat id → **Test** before saving.
5. Kill the API container once and confirm the alert arrives within 5 minutes.
   A monitoring setup that has never fired is a monitoring setup nobody has
   tested.

## Logs

Dozzle at `http://127.0.0.1:3104`, also over the tunnel. Container logs are
scrubbed at the source (`@curhat/observability`) but still contain paths, ids
and timings; they are not something to expose publicly for convenience.
