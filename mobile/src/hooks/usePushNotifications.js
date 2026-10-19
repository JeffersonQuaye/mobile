import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import {
  registerForPushNotifications,
  triggerLocalNotification,
} from "../services/notifications";

export function usePushNotifications(token, onNotificationTap = null) {
  const [pushToken, setPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    async function init() {
      const pToken = await registerForPushNotifications(token);
      if (active && pToken) {
        setPushToken(pToken);
        setPermissionGranted(true);
      }
    }

    init();

    // Foreground notification listener
    const receivedSub = Notifications.addNotificationReceivedListener(
      (incomingNotification) => {
        if (active) {
          setNotification(incomingNotification);
        }
      },
    );

    // Notification tap / interaction listener
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response?.notification?.request?.content?.data;
        if (onNotificationTap && data) {
          onNotificationTap(data);
        }
      },
    );

    return () => {
      active = false;
      receivedSub.remove();
      responseSub.remove();
    };
  }, [token, onNotificationTap]);

  const sendTestAlert = async (
    title = "Suspicious Transaction Alert",
    body = "A withdrawal of GHS 850.00 from an unfamiliar location was flagged by MoMoGuard AI.",
    data = { screen: "Alerts" },
  ) => {
    return triggerLocalNotification({ title, body, data });
  };

  return {
    pushToken,
    notification,
    permissionGranted,
    sendTestAlert,
  };
}
