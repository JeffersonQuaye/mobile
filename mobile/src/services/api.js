import { getApiBaseUrl, getConfig } from "../config/env";
import { saveSession } from "./storage";

async function request(path, options = {}, token = "") {
  const baseUrl = getApiBaseUrl();
  const config = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || 12000);

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg =
        data.error ||
        data.message ||
        (response.status === 401
          ? "Session expired or invalid credentials."
          : response.status === 403
            ? "Access denied."
            : response.status === 404
              ? "Resource not found."
              : `Request failed with status ${response.status}`);
      const error = new Error(errorMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const timeoutError = new Error("Request timed out. Please check your connection.");
      timeoutError.status = 408;
      throw timeoutError;
    }
    if (
      err.message === "Network request failed" ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError")
    ) {
      const offlineError = new Error("Unable to connect to server. Please check your internet connection.");
      offlineError.status = 0;
      offlineError.isOffline = true;
      throw offlineError;
    }
    throw err;
  }
}

export async function api(path, options = {}, token = "") {
  return request(path, options, token);
}

export async function refreshSession(refreshToken) {
  const session = await request("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  await saveSession(session);
  return session;
}

// Domain-specific API services
export const authService = {
  login: (credentials) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  register: (payload) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyPhone: ({ challenge_token, code }) =>
    request("/auth/verify-phone", {
      method: "POST",
      body: JSON.stringify({ challenge_token, code }),
    }),
  verify2Fa: ({ challenge_token, code }) =>
    request("/auth/verify-2fa", {
      method: "POST",
      body: JSON.stringify({ challenge_token, code }),
    }),
  refresh: refreshSession,
  logout: (refreshToken) =>
    request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {}),
};

export const transactionsService = {
  list: (token) => request("/transactions", {}, token),
  getById: (id, token) => request(`/transactions/${id}`, {}, token),
};

export const reportsService = {
  submit: ({ category, description, transaction_id }, token) =>
    request(
      "/reports",
      {
        method: "POST",
        body: JSON.stringify({
          category,
          description,
          transaction_id: transaction_id || null,
        }),
      },
      token,
    ),
};

export const alertsService = {
  list: (token) => request("/alerts", {}, token),
  resolve: (id, token) =>
    request(
      `/alerts/${id}`,
      { method: "PUT", body: JSON.stringify({ status: "RESOLVED" }) },
      token,
    ),
};

export const securityService = {
  get: (token) => request("/security", {}, token),
  update: (settings, token) =>
    request(
      "/security",
      { method: "PUT", body: JSON.stringify(settings) },
      token,
    ),
};

export const assistantService = {
  chat: (message, transactionId, token) =>
    request(
      "/ai/chat",
      {
        method: "POST",
        body: JSON.stringify({
          message,
          transaction_id: transactionId || null,
        }),
      },
      token,
    ),
  getConversations: (token) => request("/ai/conversations", {}, token),
};

export const notificationsService = {
  registerToken: (pushToken, platform, token) =>
    request(
      "/notifications/push-token",
      {
        method: "POST",
        body: JSON.stringify({ token: pushToken, platform }),
      },
      token,
    ),
};
