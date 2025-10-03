# Admin Dashboard Configuration

This document summarises how to configure the admin dashboard services without touching `README.md`.

## Environment variables

| Variable | Description |
| --- | --- |
| `N8N_WEBHOOK_URL` | Default webhook URL that receives service action payloads. |
| `N8N_WEBHOOK_METHOD` | Optional HTTP method used for webhook requests (defaults to `POST`). |
| `N8N_WEBHOOK_TIMEOUT` | Request timeout, in milliseconds (defaults to `5000`). |
| `N8N_WEBHOOK_HEADERS` | JSON object encoded as a string that is merged into the webhook request headers. |
| `SERVICES_CONFIG_PATH` | Absolute path to the JSON configuration file describing Docker Compose services. |
| `DEVICES_CONFIG_PATH` | Absolute path to the JSON configuration file describing monitored devices. |
| `DOCKER_SOCKET_PATH` | Path to the Docker Engine socket (defaults to `/var/run/docker.sock`). |

## Service configuration

The services read from `server/services.config.json` (or the file referenced by `SERVICES_CONFIG_PATH`). Each entry must include a unique `id`. Optional fields allow the dashboard to suggest Compose commands and forward richer payloads to N8N.

```json
[
  {
    "id": "dashboard-api",
    "label": "Admin API",
    "description": "Express backend that forwards actions to N8N",
    "project": "kweks-admin",
    "service": "api",
    "composeFile": "./docker-compose.yml",
    "composeServices": ["api"],
    "webhook": {
      "url": "https://n8n.example.com/webhook/docker-control",
      "method": "POST",
      "headers": {
        "x-api-key": "replace-me"
      },
      "payload": {
        "type": "compose-service"
      }
    }
  }
]
```

### Fields

- `project`, `service`, `composeFile`, and `composeServices` are optional, but when provided they allow the backend to build helpful `docker compose` commands that N8N can run.
- `webhook` overrides the global N8N settings for a specific service. Headers are merged with the global headers. The `payload` object (if supplied) is merged into the webhook payload as `config`.

## Webhook payload

When a user requests an action, the backend posts a JSON payload like the following:

```json
{
  "serviceId": "dashboard-api",
  "action": "up",
  "reason": "optional operator note",
  "requestedAt": "2024-01-01T12:00:00.000Z",
  "service": {
    "id": "dashboard-api",
    "label": "Admin API",
    "project": "kweks-admin",
    "service": "api",
    "composeFile": "./docker-compose.yml"
  },
  "compose": {
    "project": "kweks-admin",
    "file": "./docker-compose.yml",
    "services": ["api"]
  },
  "commands": {
    "up": {
      "command": "docker compose -f ./docker-compose.yml -p kweks-admin up -d api"
    },
    "down": {
      "command": "docker compose -f ./docker-compose.yml -p kweks-admin stop api"
    },
    "restart": {
      "command": "docker compose -f ./docker-compose.yml -p kweks-admin restart api"
    }
  }
}
```

N8N can use the `commands` map to execute shell steps or trigger other automation flows.

The API response sent back to the dashboard mirrors this payload (with webhook response metadata) so operators can see what was dispatched.

## Device configuration

Devices monitored via the dashboard are read from `server/devices.config.json` (or the path specified by
`DEVICES_CONFIG_PATH`). Each entry describes a Windows machine to monitor via ICMP ping.

```json
[
  {
    "id": "ops-desktop",
    "label": "Operations Desktop",
    "description": "Primary Windows workstation for the ops team",
    "type": "windows",
    "address": "192.168.1.50",
    "pingCount": 1,
    "timeoutMs": 4000
  }
]
```

### Device fields

- `id`, `label`, and `address` are required.
- `description` and `type` are optional metadata displayed in the UI.
- `pingCount` and `timeoutMs` allow tuning how many pings are attempted and how long (in milliseconds) the server waits for a reply.

When the dashboard requests `/api/devices`, the backend pings each configured address. Devices that respond are marked `online`,
and the response latency is reported when available. Devices that do not respond are marked `offline`, and the backend remembers
the most recent time a successful ping was observed so operators can see when a machine was last reachable.
