import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Docker from 'dockerode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG_PATH = process.env.SERVICES_CONFIG_PATH
  ? path.resolve(process.env.SERVICES_CONFIG_PATH)
  : path.resolve(__dirname, '..', 'services.config.json');

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
});

function sanitiseService(service) {
  if (!service || typeof service !== 'object') {
    return {};
  }
  const { webhook, ...rest } = service;
  return rest;
}

async function loadServicesConfig() {
  const raw = await fs.readFile(DEFAULT_CONFIG_PATH, 'utf-8');
  const services = JSON.parse(raw);
  if (!Array.isArray(services)) {
    throw new Error('services.config.json must export an array');
  }
  return services;
}

function normaliseName(name) {
  if (!name) return null;
  return name.startsWith('/') ? name.slice(1) : name;
}

function buildLabelFilters(service) {
  const labels = [];
  if (service.project) {
    labels.push(`com.docker.compose.project=${service.project}`);
  }
  if (service.service) {
    labels.push(`com.docker.compose.service=${service.service}`);
  }
  if (Array.isArray(service.labels)) {
    for (const label of service.labels) {
      if (typeof label === 'string' && label.trim().length > 0) {
        labels.push(label.trim());
      }
    }
  }
  return labels;
}

function composeArgsFromService(service) {
  if (!service) return null;
  const args = ['docker', 'compose'];
  if (service.composeFile) {
    args.push('-f', service.composeFile);
  }
  if (service.project) {
    args.push('-p', service.project);
  }
  return args;
}

function composeServiceTarget(service) {
  if (!service) return [];
  if (Array.isArray(service.composeServices) && service.composeServices.length > 0) {
    return service.composeServices
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof service.service === 'string' && service.service.trim().length > 0) {
    return [service.service.trim()];
  }
  return [];
}

function composeCommandForAction(service, action) {
  const baseArgs = composeArgsFromService(service);
  if (!baseArgs) {
    return null;
  }

  const targets = composeServiceTarget(service);
  const args = [...baseArgs];

  switch (action) {
    case 'up':
      args.push('up', '-d');
      args.push(...targets);
      break;
    case 'down':
      // Use stop instead of down to avoid tearing down the whole project
      args.push('stop');
      args.push(...targets);
      break;
    case 'restart':
      args.push('restart');
      args.push(...targets);
      break;
    default:
      return null;
  }

  return {
    argv: args,
    command: args
      .map((part) => {
        if (part.includes(' ')) {
          return `"${part.replace(/"/g, '\\"')}"`;
        }
        return part;
      })
      .join(' '),
    description: `${action} command for ${service.id}`,
  };
}

export function buildActionContext(service) {
  const hasComposeContext = Boolean(
    service &&
      (service.composeFile ||
        service.project ||
        (Array.isArray(service.composeServices) && service.composeServices.length > 0) ||
        (typeof service.service === 'string' && service.service.trim().length > 0))
  );

  if (!hasComposeContext) {
    return {
      compose: null,
      commands: {},
    };
  }

  const composeArgs = composeArgsFromService(service);
  if (!composeArgs) {
    return {
      compose: null,
      commands: {},
    };
  }

  const compose = {
    project: service.project || null,
    file: service.composeFile || null,
    services: composeServiceTarget(service),
  };

  const commands = ['up', 'down', 'restart'].reduce((acc, action) => {
    const command = composeCommandForAction(service, action);
    if (command) {
      acc[action] = command;
    }
    return acc;
  }, {});

  return {
    compose,
    commands,
  };
}

async function listContainersForService(service) {
  const labelFilters = buildLabelFilters(service);
  const listOptions = { all: true };
  if (labelFilters.length > 0) {
    listOptions.filters = { label: labelFilters };
  }

  let containers = [];
  try {
    containers = await docker.listContainers(listOptions);
  } catch (error) {
    throw new Error(
      `Unable to query Docker engine via ${docker.modem?.socketPath || 'socket'}: ${error.message}`
    );
  }

  if (containers.length === 0) {
    const nameFilters = [];
    if (typeof service.containerName === 'string') {
      nameFilters.push(service.containerName);
    }
    if (Array.isArray(service.containerNames)) {
      for (const candidate of service.containerNames) {
        if (typeof candidate === 'string') {
          nameFilters.push(candidate);
        }
      }
    }
    if (nameFilters.length > 0) {
      const filters = { name: nameFilters };
      try {
        containers = await docker.listContainers({ all: true, filters });
      } catch (error) {
        throw new Error(
          `Unable to query Docker engine via ${docker.modem?.socketPath || 'socket'}: ${error.message}`
        );
      }
    }
  }

  const detailed = await Promise.all(
    containers.map(async (container) => {
      try {
        const inspect = await docker.getContainer(container.Id).inspect();
        return { summary: container, inspect };
      } catch (error) {
        return {
          summary: container,
          inspect: null,
          inspectError: error.message,
        };
      }
    })
  );

  return detailed;
}

function describeContainer(entry) {
  const { summary, inspect } = entry;
  const state = inspect?.State;
  const healthStatus = state?.Health?.Status || null;
  const statusText =
    state?.Status || summary.State || summary.Status || (state?.Running ? 'running' : 'unknown');
  return {
    id: summary.Id,
    name:
      normaliseName(summary.Names?.[0]) ||
      normaliseName(inspect?.Name) ||
      summary.Id.slice(0, 12),
    image: summary.Image || inspect?.Config?.Image || null,
    running: Boolean(state?.Running),
    status: statusText,
    health: healthStatus,
    exitCode: typeof state?.ExitCode === 'number' ? state.ExitCode : null,
    startedAt: state?.StartedAt || null,
    finishedAt: state?.FinishedAt || null,
    inspectError: entry.inspectError || null,
  };
}

function summariseState(containers) {
  if (!containers.length) {
    return {
      state: 'unknown',
      detail: 'No matching containers found',
      container: null,
      containers: [],
    };
  }

  const running = containers.filter((item) => item.running);
  const unhealthy = containers.filter(
    (item) => item.health && item.health.toLowerCase() !== 'healthy'
  );
  const stopped = containers.filter((item) => !item.running);

  if (running.length === containers.length && unhealthy.length === 0) {
    const detail =
      containers.length === 1
        ? 'Container running'
        : `All ${containers.length} containers running`;
    return {
      state: 'up',
      detail,
      container: containers[0].name,
      containers,
    };
  }

  if (running.length === 0) {
    const detail =
      containers.length === 1
        ? 'Container stopped'
        : 'All containers stopped';
    return {
      state: 'down',
      detail,
      container: containers[0].name,
      containers,
    };
  }

  const stoppedNames = stopped.map((item) => item.name).filter(Boolean);
  const unhealthyNames = unhealthy.map((item) => item.name).filter(Boolean);
  const notes = [];
  if (stoppedNames.length > 0) {
    notes.push(`${stoppedNames.length} stopped: ${stoppedNames.join(', ')}`);
  }
  if (unhealthyNames.length > 0) {
    notes.push(`${unhealthyNames.length} unhealthy: ${unhealthyNames.join(', ')}`);
  }
  const detail = notes.length
    ? `Containers running with issues (${notes.join('; ')})`
    : `${running.length} of ${containers.length} containers running`;

  return {
    state: 'degraded',
    detail,
    container: containers[0].name,
    containers,
  };
}

async function getComposeStatus(service) {
  try {
    const containerEntries = await listContainersForService(service);
    const containers = containerEntries.map(describeContainer);
    const summary = summariseState(containers);
    return {
      ...summary,
      raw: containerEntries,
    };
  } catch (error) {
    return {
      state: 'unknown',
      detail: error.message,
      container: null,
      containers: [],
      raw: [],
    };
  }
}

const desiredStates = new Map();

export async function getServices() {
  const services = await loadServicesConfig();
  const resolved = await Promise.all(
    services.map(async (service) => {
      const status = await getComposeStatus(service);
      const desired = desiredStates.get(service.id) || null;
      const actionContext = buildActionContext(service);
      const safeService = sanitiseService(service);
      return {
        ...safeService,
        status,
        desired,
        actions: actionContext.commands,
        compose: actionContext.compose,
      };
    })
  );
  return resolved;
}

export function setDesiredState(serviceId, state, meta = {}) {
  const entry = {
    state,
    updatedAt: new Date().toISOString(),
    meta,
  };
  desiredStates.set(serviceId, entry);
  return entry;
}

export async function findServiceById(id) {
  const services = await loadServicesConfig();
  return services.find((svc) => svc.id === id) || null;
}
