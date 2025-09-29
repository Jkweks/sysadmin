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
