import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { getCache, setCache } from "../services/storage";

export function useApi(path, token, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [isCached, setIsCached] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const method = options.method || "GET";
  const cacheKey = options.cacheKey || path;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else if (!dataRef.current) {
        setLoading(true);
      }
      setError("");

      try {
        const result = await api(path, optionsRef.current, token);
        setData(result);
        setIsCached(false);
        setIsOffline(false);
        // Persist to offline cache for GET requests
        if (method === "GET") {
          await setCache(cacheKey, result);
        }
      } catch (requestError) {
        // Check for offline / network failure
        const isNetworkError =
          requestError.isOffline ||
          requestError.status === 0 ||
          requestError.message?.toLowerCase().includes("offline") ||
          requestError.message?.toLowerCase().includes("network");

        setIsOffline(isNetworkError);

        // Attempt to fall back to cached data
        const cached = await getCache(cacheKey);
        if (cached?.data) {
          setData(cached.data);
          setIsCached(true);
          setError(
            isNetworkError
              ? "You are offline. Showing saved data from your last visit."
              : requestError.message,
          );
        } else {
          setError(
            isNetworkError
              ? "Network unavailable. Please connect to the internet to load."
              : requestError.message || "An unexpected error occurred.",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path, token, cacheKey, method],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  const retry = useCallback(() => load(false), [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    isCached,
    isOffline,
    retry,
    refresh,
  };
}
