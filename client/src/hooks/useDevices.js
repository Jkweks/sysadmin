import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDevices } from '../api.js';

export function useDevices({ enabled = true } = {}) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchDevices();
      setDevices(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Unable to load devices');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [enabled, load]);

  const actions = useMemo(
    () => ({
      refresh: load,
    }),
    [load],
  );

  return { devices, loading, error, lastUpdated, ...actions };
}
