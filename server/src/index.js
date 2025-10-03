import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import {
  getServices,
  findServiceById,
  setDesiredState,
  buildActionContext,
} from './dockerService.js';
import { getDevicesWithStatus } from './deviceService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
function parseHeaders(input) {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse N8N_WEBHOOK_HEADERS. Expected valid JSON object.');
  }
  return {};
}

const globalWebhookConfig = {
  url: process.env.N8N_WEBHOOK_URL || '',
  method: (process.env.N8N_WEBHOOK_METHOD || 'POST').toUpperCase(),
  timeout: Number(process.env.N8N_WEBHOOK_TIMEOUT || 5000),
  headers: parseHeaders(process.env.N8N_WEBHOOK_HEADERS || ''),
};

function resolveWebhookConfig(service) {
  const webhook = service.webhook || {};
  const url = webhook.url || globalWebhookConfig.url;
  if (!url) {
    return null;
  }
  const method = (webhook.method || globalWebhookConfig.method || 'POST').toUpperCase();
  const timeout = Number(webhook.timeout || globalWebhookConfig.timeout || 5000);
  const headers = { ...globalWebhookConfig.headers, ...(webhook.headers || {}) };
  return {
    url,
    method,
    timeout,
    headers,
    payload: webhook.payload || null,
  };
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/services', async (req, res) => {
  try {
    const services = await getServices();
    res.json({ services });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load services',
      detail: error.message,
    });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const devices = await getDevicesWithStatus();
    res.json({ devices });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to load devices',
      detail: error.message,
    });
  }
});

app.post('/api/services/:id/actions', async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  if (!action || !['up', 'down', 'restart'].includes(action)) {
    return res.status(400).json({
      error: "Action must be one of 'up', 'down', or 'restart'",
    });
  }

  try {
    const service = await findServiceById(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const webhookConfig = resolveWebhookConfig(service);
    const actionContext = buildActionContext(service);
    const { webhook: _ignoredWebhook, ...serviceForPayload } = service;
    const payload = {
      serviceId: id,
      action,
      reason: reason || null,
      requestedAt: new Date().toISOString(),
      service: serviceForPayload,
      compose: actionContext.compose,
      commands: actionContext.commands,
    };

    if (webhookConfig?.payload && typeof webhookConfig.payload === 'object') {
      payload.config = webhookConfig.payload;
    }

    let webhookResponse = null;
    if (webhookConfig?.url) {
      try {
        const { data, status, headers } = await axios({
          url: webhookConfig.url,
          method: webhookConfig.method,
          data: payload,
          timeout: webhookConfig.timeout,
          headers: webhookConfig.headers,
        });
        webhookResponse = { status, data, headers };
      } catch (webhookError) {
        webhookResponse = {
          status: webhookError.response?.status || 500,
          error: webhookError.message,
          data: webhookError.response?.data,
        };
      }
    }

    const desired = setDesiredState(id, action, {
      reason: reason || null,
      webhook: webhookResponse,
      requestedAt: payload.requestedAt,
    });

    return res.status(202).json({
      message: 'Action received',
      desiredState: desired,
      webhook: webhookResponse,
      payload,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Admin API listening on port ${port}`);
});
