import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { getCache, setCache } from "../services/storage";

export function useApi(path, token, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [isCached, setIsCached] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const cacheKey = options.cacheKey || path;

  const load = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else if (!data) {
        setLoading(true);
      }
      setError("");

      try {
        const result = await api(path, options, token);
        setData(result);
        setIsCached(false);
        setIsOffline(false);
        // Persist to offline cache for GET requests
        if (!options.method || options.method === "GET") {
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
    [path, token, cacheKey, data, options],
  );

  useEffect(() => {
    load();
  }, [path, token]);

  const refresh = useCallback(() => load(true), [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    isCached,
    isOffline,
    retry: () => load(false),
    refresh,
  };
}
