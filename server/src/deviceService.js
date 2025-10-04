import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DEVICES_CONFIG_PATH = process.env.DEVICES_CONFIG_PATH
  ? path.resolve(process.env.DEVICES_CONFIG_PATH)
  : path.resolve(__dirname, '..', 'devices.config.json');

const lastKnownOnline = new Map();

function resolveDeviceTimeout(device) {
  if (!device) return 4000;
  const timeout = Number(device.timeoutMs);
  if (Number.isFinite(timeout) && timeout > 0) {
    return timeout;
  }
  return 4000;
}

function resolveDevicePingCount(device) {
  if (!device) return 1;
  const count = Number(device.pingCount);
  if (Number.isInteger(count) && count > 0) {
    return count;
  }
  return 1;
}

function buildPingArgs(address, options = {}) {
  const { timeoutMs = 4000, count = 1 } = options;
  const platform = process.platform;
  if (platform === 'win32') {
    return ['-n', String(count), '-w', String(timeoutMs), address];
  }
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return ['-n', '-c', String(count), '-w', String(timeoutSeconds), address];
}

function parsePingLatency(output) {
  if (!output) return null;
  const match = output.match(/time[=<]([\d.]+)\s*ms/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractErrorDetail(error) {
  if (!error) return null;
  if (error.code === 'ENOENT') {
    return 'ping command is not available on the server host';
  }
  if (error.killed) {
    return 'Ping command timed out before a reply was received';
  }
  const combined = [error.stdout, error.stderr]
    .filter((chunk) => typeof chunk === 'string' && chunk.trim().length > 0)
    .join('\n');
  if (!combined) {
    return 'Host did not respond to ping';
  }
  const lines = combined.trim().split('\n');
  return lines[lines.length - 1];
}

async function loadDevicesConfig() {
  const raw = await fs.readFile(DEFAULT_DEVICES_CONFIG_PATH, 'utf-8');
  const devices = JSON.parse(raw);
  if (!Array.isArray(devices)) {
    throw new Error('devices.config.json must export an array');
  }
  return devices;
}

async function checkDeviceStatus(device) {
  const checkedAt = new Date();
  if (!device.address) {
    return {
      state: 'unknown',
      detail: 'No address configured for this device',
      lastChecked: checkedAt.toISOString(),
      lastOnline: lastKnownOnline.get(device.id) || null,
      latencyMs: null,
    };
  }

  const timeoutMs = resolveDeviceTimeout(device);
  const pingCount = resolveDevicePingCount(device);
  const args = buildPingArgs(device.address, { timeoutMs, count: pingCount });

  try {
    const { stdout, stderr } = await execFileAsync('ping', args, {
      timeout: timeoutMs + 1000,
      windowsHide: true,
    });
    const latency = parsePingLatency(stdout) ?? parsePingLatency(stderr);
    const lastOnline = checkedAt.toISOString();
    lastKnownOnline.set(device.id, lastOnline);
    return {
      state: 'online',
      detail: 'Device responded to ICMP ping',
      lastChecked: checkedAt.toISOString(),
      lastOnline,
      latencyMs: latency ?? null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        state: 'unknown',
        detail: 'ping command is not available on the server host',
        lastChecked: checkedAt.toISOString(),
        lastOnline: lastKnownOnline.get(device.id) || null,
        latencyMs: null,
      };
    }

    const detail = extractErrorDetail(error);
    return {
      state: 'offline',
      detail: detail || 'Device did not respond to ping',
      lastChecked: checkedAt.toISOString(),
      lastOnline: lastKnownOnline.get(device.id) || null,
      latencyMs: null,
    };
  }
}

export async function getDevices() {
  return loadDevicesConfig();
}

export async function getDevicesWithStatus() {
  const devices = await loadDevicesConfig();
  const withStatus = await Promise.all(
    devices.map(async (device) => ({
      ...device,
      status: await checkDeviceStatus(device),
    })),
  );
  return withStatus;
}

export async function findDeviceById(id) {
  if (!id) return null;
  const devices = await loadDevicesConfig();
  return devices.find((device) => device.id === id) || null;
}
