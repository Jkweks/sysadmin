import { useMemo, useState } from 'react';
import './App.css';
import { useServices } from './hooks/useServices.js';

const statusColors = {
  up: '#22c55e',
  down: '#ef4444',
  degraded: '#f97316',
  unknown: '#94a3b8',
};

function StatusPill({ status }) {
  const color = statusColors[status.state] || statusColors.unknown;
  return (
    <span className="status-pill" style={{ backgroundColor: color }}>
      {status.state.toUpperCase()}
    </span>
  );
}

function formatDate(date) {
  if (!date) return 'never';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
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
                {service.compose ? (
                  <ul>
                    <li>
                      <strong>Project:</strong> {service.compose.project || 'default'}
                    </li>
                    <li>
                      <strong>File:</strong> {service.compose.file || 'docker-compose.yml'}
                    </li>
                    <li>
                      <strong>Services:</strong>{' '}
                      {service.compose.services?.length
                        ? service.compose.services.join(', ')
                        : '—'}
                    </li>
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
              <div>
                <h4>Containers</h4>
                {containers.length > 0 ? (
                  <ul className="container-list">
                    {containers.map((container) => (
                      <li key={container.id}>
                        <div className="container-name">{container.name}</div>
                        <div className="container-meta">
                          <span>{container.status}</span>
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

export default function App() {
  const { services, loading, error, sendAction, lastUpdated, refresh } = useServices();
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const handleAction = async (id, action, reason) => {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await sendAction(id, action, reason);
      setMessage({
        type: 'success',
        text: `Action ${action.toUpperCase()} queued for ${id}`,
        detail: response,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>Kweks Infrastructure Dashboard</h1>
          <p>Monitor docker compose services and trigger automations via N8N.</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={refresh} disabled={loading}>
            Refresh
          </button>
          <div className="last-updated">Last updated: {formatDate(lastUpdated)}</div>
        </div>
      </header>

      {message && (
        <div className={`alert ${message.type}`}>
          <div>{message.text}</div>
          {message.detail && (
            <pre className="webhook-detail">{JSON.stringify(message.detail, null, 2)}</pre>
          )}
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <div className="card">
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
            {loading && (
              <tr>
                <td colSpan="5" className="loading-row">
                  Loading services…
                </td>
              </tr>
            )}
            {!loading && services.length === 0 && (
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
      </div>
    </div>
  );
}
