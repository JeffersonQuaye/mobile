import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) =>
      setOnline(Boolean(state.isConnected)),
    );
    return unsubscribe;
  }, []);
  return online;
}
