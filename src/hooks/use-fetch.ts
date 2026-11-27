"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";

/** Minimal data hook: loading / error / data / reload, ignoring stale responses. */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!url) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<T>(url);
        if (id === seq.current) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: () => load(true), setData };
}
