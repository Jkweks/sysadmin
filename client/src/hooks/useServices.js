import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchServices, sendServiceAction } from '../api.js';

export function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchServices();
      setServices(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Unable to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const actions = useMemo(
    () => ({
      async sendAction(id, action, reason) {
        const response = await sendServiceAction(id, action, reason);
        await load();
        return response;
      },
      refresh: load,
    }),
    [load]
  );

  return { services, loading, error, lastUpdated, ...actions };
}
