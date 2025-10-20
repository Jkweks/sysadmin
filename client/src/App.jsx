import { useMemo, useState } from 'react';
import './App.css';
import { useDevices } from './hooks/useDevices.js';
import { useServices } from './hooks/useServices.js';

const statusColors = {
  up: '#22c55e',
  down: '#ef4444',
  degraded: '#f97316',
  online: '#22c55e',
  offline: '#ef4444',
  unknown: '#94a3b8',
};

function StatusPill({ status }) {
  const state = status?.state || 'unknown';
  const color = statusColors[state] || statusColors.unknown;
  return (
    <span className="status-pill" style={{ backgroundColor: color }}>
      {state.toUpperCase()}
    </span>
  );
}

function formatDate(date) {
  if (!date) return 'never';
  const value = typeof date === 'string' ? new Date(date) : date;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 'never';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const delta = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.round(delta / 60000);
  if (Math.abs(minutes) < 1) {
    const seconds = Math.round(delta / 1000);
    return rtf.format(seconds, 'second');
  }
  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
}

function ServiceRow({ service, onAction, busyId }) {
  const [reason, setReason] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const isBusy = busyId === service.id;
  const containers = service.status.containers || [];
  const stackServices = service.stack?.services || [];
  const stackError = service.stack?.error || null;
  const stackProject = service.stack?.project || service.compose?.project || 'default';
  const stackFile = service.stack?.file || service.compose?.file || 'docker-compose.yml';
  const primaryStackService = service.stack?.primaryService || null;

  const desiredLabel = useMemo(() => {
    if (!service.desired) return '—';
    return `${service.desired.state.toUpperCase()} · ${formatRelativeTime(
      service.desired.updatedAt
    )}`;
  }, [service.desired]);

  const webhookStatus = service.desired?.meta?.webhook;

  const handleAction = async (action) => {
    await onAction(service.id, action, reason || undefined);
    setReason('');
  };

  return (
    <>
      <tr>
        <td>
          <div className="service-name">{service.label}</div>
          <div className="service-description">{service.description}</div>
        </td>
        <td>
          <StatusPill status={service.status} />
          <div className="service-detail">{service.status.detail}</div>
        </td>
        <td>{service.status.container || '—'}</td>
        <td>
          <div className="desired-state">
            <div className="desired-label">{desiredLabel}</div>
            {service.desired?.meta?.reason && (
              <div className="desired-reason">Reason: {service.desired.meta.reason}</div>
            )}
            {webhookStatus && (
              <div
                className={`desired-webhook ${
                  webhookStatus.error ? 'error' : 'success'
                }`}
              >
                Webhook {webhookStatus.status || 'failed'}
              </div>
            )}
            {webhookStatus?.error && (
              <div className="desired-webhook-error">{webhookStatus.error}</div>
            )}
          </div>
        </td>
        <td>
          <textarea
            className="reason-input"
            placeholder="Optional reason for N8N run"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="action-buttons">
            <button
              className="btn btn-up"
              onClick={() => handleAction('up')}
              disabled={isBusy}
            >
              Bring Up
            </button>
            <button
              className="btn btn-build"
              onClick={() => handleAction('build')}
              disabled={isBusy}
            >
              Build & Up
            </button>
            <button
              className="btn btn-down"
              onClick={() => handleAction('down')}
              disabled={isBusy}
            >
              Bring Down
            </button>
            <button
              className="btn btn-restart"
              onClick={() => handleAction('restart')}
              disabled={isBusy}
            >
              Restart
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowDetails((value) => !value)}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </td>
      </tr>
      {showDetails && (
        <tr className="service-details">
          <td colSpan="5">
            <div className="details-grid">
              <div>
                <h4>Compose context</h4>
                {service.compose || service.stack ? (
                  <ul>
                    <li>
                      <strong>Project:</strong> {stackProject || 'default'}
                    </li>
                    <li>
                      <strong>File:</strong> {stackFile || 'docker-compose.yml'}
                    </li>
                    <li>
                      <strong>Services tracked:</strong>{' '}
                      {stackServices.length > 0 ? stackServices.length : '—'}
                    </li>
                    {primaryStackService && stackServices.length > 0 && (
                      <li>
                        <strong>Primary service:</strong> {primaryStackService}
                      </li>
                    )}
                  </ul>
                ) : (
                  <p>No compose metadata available.</p>
                )}
                {service.actions && Object.keys(service.actions).length > 0 && (
                  <div className="command-list">
                    <h5>Suggested commands</h5>
                    {Object.entries(service.actions).map(([action, command]) => (
                      <div key={action} className="command-entry">
                        <span className="command-label">{action.toUpperCase()}</span>
                        <code>{command.command}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(stackServices.length > 0 || stackError) && (
                <div>
                  <h4>Stack services</h4>
                  {stackError && <div className="stack-error">{stackError}</div>}
                  {stackServices.length > 0 ? (
                    <ul className="stack-service-list">
                      {stackServices.map((stackService) => (
                        <li key={stackService.name} className="stack-service-item">
                          <div className="stack-service-header">
                            <div className="stack-service-title">
                              <span className="stack-service-name">{stackService.name}</span>
                              {stackService.name === primaryStackService && (
                                <span className="stack-primary-tag">Primary</span>
                              )}
                            </div>
                            <StatusPill status={stackService.status} />
                          </div>
                          {stackService.status?.detail && (
                            <div className="stack-service-detail">{stackService.status.detail}</div>
                          )}
                          {stackService.status?.containers?.length > 0 && (
                            <div className="stack-service-meta">
                              {stackService.status.containers.length} container
                              {stackService.status.containers.length === 1 ? '' : 's'}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !stackError && <p>No services discovered in compose file.</p>
                  )}
                </div>
              )}
              <div>
                <h4>Containers</h4>
                {containers.length > 0 ? (
                  <ul className="container-list">
                    {containers.map((container) => (
                      <li key={container.id}>
                        <div className="container-name">{container.name}</div>
                        <div className="container-meta">
                          <span>{container.status}</span>
                          {container.composeService && (
                            <span> · Service: {container.composeService}</span>
                          )}
                          {container.health && <span> · Health: {container.health}</span>}
                          {container.exitCode !== null && (
                            <span> · Exit: {container.exitCode}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No containers discovered for this service.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DeviceRow({ device }) {
  const status = device.status || { state: 'unknown' };
  const latency =
    typeof status.latencyMs === 'number' && Number.isFinite(status.latencyMs)
      ? `${status.latencyMs.toFixed(1)} ms`
      : null;
  const lastChecked = status.lastChecked ? formatDate(status.lastChecked) : 'never';
  const lastCheckedRelative = status.lastChecked
    ? formatRelativeTime(status.lastChecked)
    : '';
  const lastOnlineRelative =
    status.state !== 'online' && status.lastOnline ? formatRelativeTime(status.lastOnline) : null;

  return (
    <tr>
      <td>
        <div className="device-name">{device.label}</div>
        {device.description && <div className="device-description">{device.description}</div>}
        <div className="device-meta">Type: {device.type || '—'}</div>
      </td>
      <td>
        <StatusPill status={status} />
        {status.detail && <div className="device-detail">{status.detail}</div>}
        {latency && <div className="device-meta">Latency: {latency}</div>}
      </td>
      <td>
        <div className="device-address">{device.address || '—'}</div>
      </td>
      <td>
        <div className="device-meta">Last checked: {lastChecked}</div>
        {lastCheckedRelative && (
          <div className="device-meta subtle">{lastCheckedRelative}</div>
        )}
        {lastOnlineRelative && (
          <div className="device-meta subtle">Last online {lastOnlineRelative}</div>
        )}
      </td>
    </tr>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('services');
  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    sendAction,
    lastUpdated: servicesLastUpdated,
    refresh: refreshServices,
  } = useServices();
  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
    lastUpdated: devicesLastUpdated,
    refresh: refreshDevices,
  } = useDevices({ enabled: activeTab === 'devices' });
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const handleAction = async (id, action, reason) => {
    setBusyId(id);
    setMessage(null);
    try {
      await sendAction(id, action, reason);
      setMessage({
        type: 'success',
        text: 'Action Success',
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const isServicesTab = activeTab === 'services';
  const currentLoading = isServicesTab ? servicesLoading : devicesLoading;
  const currentError = isServicesTab ? servicesError : devicesError;
  const currentLastUpdated = isServicesTab ? servicesLastUpdated : devicesLastUpdated;
  const handleRefresh = isServicesTab ? refreshServices : refreshDevices;

  return (
    <div className="app">
      <header>
        <div>
          <h1>Kweks Infrastructure Dashboard</h1>
          <p>Monitor docker compose services and trigger automations via N8N.</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={handleRefresh} disabled={currentLoading}>
            Refresh
          </button>
          <div className="last-updated">Last updated: {formatDate(currentLastUpdated)}</div>
        </div>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${isServicesTab ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices
        </button>
      </div>

      {isServicesTab && message && (
        <div className={`alert ${message.type}`}>
          <div>{message.text}</div>
          {message.detail && (
            <pre className="webhook-detail">{JSON.stringify(message.detail, null, 2)}</pre>
          )}
        </div>
      )}

      {currentError && <div className="alert error">{currentError}</div>}

      <div className="card">
        {isServicesTab ? (
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Container</th>
                <th>Desired State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {servicesLoading && (
                <tr>
                  <td colSpan="5" className="loading-row">
                    Loading services…
                  </td>
                </tr>
              )}
              {!servicesLoading && services.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-row">
                    No services configured. Update services.config.json on the server.
                  </td>
                </tr>
              )}
              {services.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  onAction={handleAction}
                  busyId={busyId}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <table className="device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Address</th>
                <th>Checks</th>
              </tr>
            </thead>
            <tbody>
              {devicesLoading && (
                <tr>
                  <td colSpan="4" className="loading-row">
                    Checking devices…
                  </td>
                </tr>
              )}
              {!devicesLoading && devices.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-row">
                    No devices configured. Update devices.config.json on the server.
                  </td>
                </tr>
              )}
              {devices.map((device) => (
                <DeviceRow key={device.id} device={device} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
