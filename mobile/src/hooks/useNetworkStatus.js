/**
 * MoMoGuard Network Reachability Hook (`useNetworkStatus`)
 * --------------------------------------------------------
 * Subscribes to real-time network connectivity changes using `@react-native-community/netinfo`.
 * Returns a reactive boolean flag (`online`) indicating whether the mobile device has
 * an active internet connection (Wi-Fi, Cellular, or Ethernet).
 */

import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Listen for socket connection status changes from native operating system
    const unsubscribe = NetInfo.addEventListener((state) =>
      setOnline(Boolean(state.isConnected)),
    );
    return unsubscribe;
  }, []);

  return online;
}
