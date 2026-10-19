import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_KEYS = [
  "momoguard_user",
  "momoguard_token",
  "momoguard_refresh_token",
];
const ENV_KEY = "momoguard_env_preference";
const CACHE_PREFIX = "momoguard_cache_";

async function isSecureStoreAvailable() {
  if (Platform.OS === "web") return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function saveSession(session) {
  if (!session) return;
  const pairs = [
    [SESSION_KEYS[0], JSON.stringify(session.user || {})],
    [SESSION_KEYS[1], session.token || ""],
    [SESSION_KEYS[2], session.refresh_token || ""],
  ];

  const secure = await isSecureStoreAvailable();
  if (secure) {
    await Promise.all(
      pairs.map(([k, v]) => (v ? SecureStore.setItemAsync(k, v) : Promise.resolve())),
    );
  } else {
    await AsyncStorage.multiSet(pairs);
  }
}

export async function loadSession() {
  try {
    const secure = await isSecureStoreAvailable();
    if (secure) {
      const [userStr, token, refreshToken] = await Promise.all(
        SESSION_KEYS.map((k) => SecureStore.getItemAsync(k)),
      );
      if (userStr && token) {
        return {
          user: JSON.parse(userStr),
          token,
          refresh_token: refreshToken || null,
        };
      }
    } else {
      const pairs = await AsyncStorage.multiGet(SESSION_KEYS);
      const dict = Object.fromEntries(pairs);
      if (dict[SESSION_KEYS[0]] && dict[SESSION_KEYS[1]]) {
        return {
          user: JSON.parse(dict[SESSION_KEYS[0]]),
          token: dict[SESSION_KEYS[1]],
          refresh_token: dict[SESSION_KEYS[2]] || null,
        };
      }
    }
  } catch (err) {
    console.warn("Error restoring session:", err);
  }
  return null;
}

export async function clearSession() {
  try {
    const secure = await isSecureStoreAvailable();
    if (secure) {
      await Promise.all(
        SESSION_KEYS.map((k) =>
          SecureStore.deleteItemAsync(k).catch(() => {}),
        ),
      );
    }
    await AsyncStorage.multiRemove(SESSION_KEYS).catch(() => {});
  } catch (err) {
    console.warn("Error clearing session:", err);
  }
}

// Offline cache helpers
export async function setCache(key, data) {
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data,
    });
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, payload);
  } catch (err) {
    console.warn("Failed to set cache:", err);
  }
}

export async function getCache(key) {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveEnvPreference(env) {
  try {
    await AsyncStorage.setItem(ENV_KEY, env);
  } catch {}
}

export async function loadEnvPreference() {
  try {
    return await AsyncStorage.getItem(ENV_KEY);
  } catch {
    return null;
  }
}
