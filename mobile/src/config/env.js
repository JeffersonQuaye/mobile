/**
 * MoMoGuard Multi-Environment Configuration
 * ------------------------------------------
 * Manages runtime endpoint configuration across development, staging, and production tiers.
 *
 * Capabilities:
 * 1. Automatic host discovery: Differentiates between web (localhost), Android emulator (10.0.2.2),
 *    and physical device LAN addresses (EXPO_PUBLIC_API_BASE_URL).
 * 2. Tiered security & timeouts: Enforces SSL and disables mock logs in production.
 * 3. Dynamic runtime switching: Supports switching backend environments on-the-fly for testing.
 */

import { Platform } from "react-native";

export const ENVIRONMENTS = {
  DEVELOPMENT: "development",
  STAGING: "staging",
  PRODUCTION: "production",
};

// Platform-aware local development fallback addresses
const DEFAULT_DEV_HOST =
  Platform.OS === "web" ? "http://localhost:5000/api" : "http://10.0.2.2:5000/api";

const ENV_CONFIGS = {
  [ENVIRONMENTS.DEVELOPMENT]: {
    name: "Development",
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_DEV_HOST,
    timeoutMs: 12000,
    enableDetailedLogs: true,
    enableMockPushTest: true,
    requireSsl: false,
    badgeColor: "#50d5d0",
  },
  [ENVIRONMENTS.STAGING]: {
    name: "Staging (Preview)",
    apiBaseUrl:
      process.env.EXPO_PUBLIC_STAGING_API_URL || "https://staging-api.momoguard.com/api",
    timeoutMs: 15000,
    enableDetailedLogs: true,
    enableMockPushTest: true,
    requireSsl: true,
    badgeColor: "#f1bd68",
  },
  [ENVIRONMENTS.PRODUCTION]: {
    name: "Production",
    apiBaseUrl: process.env.EXPO_PUBLIC_PROD_API_URL || "https://api.momoguard.com/api",
    timeoutMs: 10000,
    enableDetailedLogs: false,
    enableMockPushTest: false,
    requireSsl: true,
    badgeColor: "#7cdda5",
  },
};

// Default environment determined from Expo environment variable or fallback
const initialEnv =
  (process.env.EXPO_PUBLIC_ENV &&
    ENV_CONFIGS[process.env.EXPO_PUBLIC_ENV.toLowerCase()] &&
    process.env.EXPO_PUBLIC_ENV.toLowerCase()) ||
  ENVIRONMENTS.DEVELOPMENT;

let currentRuntimeEnv = initialEnv;
let currentCustomApiUrl = null;

export function getActiveEnv() {
  return currentRuntimeEnv;
}

export function setRuntimeEnv(envName, customUrl = null) {
  if (ENV_CONFIGS[envName]) {
    currentRuntimeEnv = envName;
    currentCustomApiUrl = customUrl;
    return true;
  }
  return false;
}

export function getConfig() {
  const base = ENV_CONFIGS[currentRuntimeEnv] || ENV_CONFIGS[ENVIRONMENTS.DEVELOPMENT];
  return {
    ...base,
    env: currentRuntimeEnv,
    apiBaseUrl: currentCustomApiUrl || base.apiBaseUrl,
    isDev: currentRuntimeEnv === ENVIRONMENTS.DEVELOPMENT,
    isStaging: currentRuntimeEnv === ENVIRONMENTS.STAGING,
    isProduction: currentRuntimeEnv === ENVIRONMENTS.PRODUCTION,
  };
}

export const APP_ENV = currentRuntimeEnv;
export const getApiBaseUrl = () => getConfig().apiBaseUrl;
export const API_BASE_URL = getConfig().apiBaseUrl;
