import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { notificationsService } from "./api";

// Configure default notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotificationChannels() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("security", {
      name: "Security alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#50d5d0",
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("transactions", {
      name: "Transaction alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 200],
      lightColor: "#7cdda5",
    });
  }
}

export async function registerForPushNotifications(authToken) {
  if (Platform.OS === "web") return null;

  try {
    await setupNotificationChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.easConfig?.projectId ||
      Constants.expoConfig?.extra?.eas?.projectId;

    let pushToken = null;
    if (Device.isDevice && projectId) {
      const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
      pushToken = tokenObj.data;
    } else {
      // In simulator or without EAS project ID, generate an informative identifier
      pushToken = `Simulated-Token-${Platform.OS}-${Device.modelName || "device"}`;
    }

    if (authToken && pushToken) {
      await notificationsService
        .registerToken(pushToken, Platform.OS, authToken)
        .catch(() => {});
    }

    return pushToken;
  } catch (err) {
    console.warn("Notification registration warning:", err);
    return null;
  }
}

/**
 * Triggers a local security notification for immediate testing or simulator demos.
 */
export async function triggerLocalNotification({
  title = "MoMoGuard Security Alert",
  body = "Unusual transaction detected. Tap to inspect.",
  data = {},
}) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // deliver immediately
    });
  } catch (err) {
    console.warn("Failed to schedule local notification:", err);
  }
}
