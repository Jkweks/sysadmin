const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function handleResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      const message = data.error || data.message || text;
      throw new Error(message || 'Request failed');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(text || 'Request failed');
      }
      throw error;
    }
  }
  return response.json();
}

export async function fetchServices() {
  const response = await fetch(`${API_BASE_URL}/services`);
  const data = await handleResponse(response);
  return data.services || [];
}

export async function fetchDevices() {
  const response = await fetch(`${API_BASE_URL}/devices`);
  const data = await handleResponse(response);
  return data.devices || [];
}

export async function sendServiceAction(serviceId, action, reason) {
  const response = await fetch(`${API_BASE_URL}/services/${serviceId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
  });
  return handleResponse(response);
}
