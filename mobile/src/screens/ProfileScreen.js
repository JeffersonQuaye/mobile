/**
 * MoMoGuard Profile & Settings Screen
 * -------------------------------------
 * Central hub for user identity, environment configuration, and session control.
 *
 * Sections:
 * 1. User Information Card: Displays the authenticated user's name, email, phone,
 *    and a verified account badge.
 * 2. Environment Configuration: Allows switching between Development, Staging, and
 *    Production API backends at runtime without an app rebuild (useful for QA / demos).
 * 3. Push Notifications Testing: Shows the Expo push token and lets devs fire a
 *    simulated security alert to verify the full notification pipeline.
 * 4. Session Security / Sign Out: Prompts via Alert (native) or confirm (web) before
 *    clearing the session token from secure storage and returning to AuthScreen.
 */

import React, { useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { ENVIRONMENTS, getConfig } from "../config/env";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { colors, styles } from "../theme";
import { Button, Card, Header, Screen, StatusBadge } from "../components/UI";

export default function ProfileScreen() {
  // Destructure auth context to get current user data and session management helpers
  const { user, token, logout, switchEnvironment } = useAuth();
  // Hook for Expo push notifications; provides the device push token and a helper to send test alerts
  const { sendTestAlert, pushToken } = usePushNotifications(token);
  // Track the active environment config (name, apiBaseUrl, badgeColor) for the UI badge
  const [activeConfig, setActiveConfig] = useState(getConfig());
  // Controls the temporary success state on the test-notification button
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  /**
   * Switches the active API environment (DEV / STAGING / PROD), persists the
   * choice via AuthContext, and refreshes the local config display state.
   *
   * @param {string} envKey - One of the ENVIRONMENTS constant values.
   */
  async function handleEnvSwitch(envKey) {
    await switchEnvironment(envKey);
    // Re-read config from env.js after the context updates AsyncStorage
    const updated = getConfig();
    setActiveConfig(updated);
  }

  /**
   * Fires a simulated MoMo security alert push notification.
   * The data payload includes `screen: "Alerts"` so tapping the notification
   * deep-links the user directly to the Alerts tab.
   * On success, temporarily shows a confirmation label for 5 seconds.
   */
  async function handleSendTestPush() {
    try {
      await sendTestAlert(
        "🚨 High-Risk Transaction Alert",
        "A withdrawal of GHS 1,200.00 from Accra New Town was flagged by AI.",
        { screen: "Alerts" }, // Deep-link payload used by the notification handler
      );
      setTestNotificationSent(true);
      // Reset the button label after 5 seconds
      setTimeout(() => setTestNotificationSent(false), 5000);
    } catch (err) {
      console.warn("Failed to trigger test notification:", err);
    }
  }

  /**
   * Prompts the user to confirm sign-out before clearing the session.
   * Uses a native Alert dialog on mobile and window.confirm on web.
   */
  function handleLogoutPrompt() {
    if (Platform.OS === "web") {
      // window.confirm is synchronous on web — no native Alert available
      if (confirm("Are you sure you want to sign out of MoMoGuard?")) {
        logout();
      }
    } else {
      // Native iOS/Android destructive-action sheet pattern
      Alert.alert(
        "Sign Out",
        "Are you sure you want to end your secure MoMoGuard session?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: logout },
        ],
      );
    }
  }

  return (
    <Screen scrollable>
      <Header
        eyebrow="ACCOUNT & CONFIGURATION"
        title="Profile & Settings"
        subtitle="Manage your identity, security devices, and environment configuration."
      />

      {/* User Information Card */}
      <Card raised>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.surface,
              borderColor: colors.accent,
              borderWidth: 2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 24, color: colors.accent }}>👤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { fontSize: 18 }]}>
              {user?.full_name || "MoMoGuard User"}
            </Text>
            <Text style={styles.mutedSmall}>{user?.email || "No email"}</Text>
            <Text style={styles.mutedSmall}>
              📞 {user?.phone || "No registered phone"}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={styles.muted}>Verification Status:</Text>
          <StatusBadge status="SAFE" />
        </View>
      </Card>

      {/* Environment Configuration Card */}
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={styles.cardTitle}>Environment Configuration</Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: activeConfig.badgeColor + "20",
                borderColor: activeConfig.badgeColor,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: activeConfig.badgeColor }]}>
              {activeConfig.name}
            </Text>
          </View>
        </View>

        <Text style={[styles.mutedSmall, { marginBottom: 12 }]}>
          API Endpoint: {activeConfig.apiBaseUrl}
        </Text>

        {/* Environment Switcher Buttons */}
        <Text style={styles.label}>SWITCH ENVIRONMENT</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {Object.entries(ENVIRONMENTS).map(([_key, value]) => {
            const isSelected = activeConfig.env === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${value} environment`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => handleEnvSwitch(value)}
                style={[
                  styles.filter,
                  { flex: 1, alignItems: "center" },
                  isSelected && styles.filterActive,
                ]}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.mutedSmall, { color: colors.muted }]}>
          • Development: Local flask server with debug logging.
          {"\n"}• Staging: Pre-production verification pipeline.
          {"\n"}• Production: Encrypted production services.
        </Text>
      </Card>

      {/* Push Notifications Testing Card */}
      <Card>
        <Text style={styles.cardTitle}>Push Notifications Service</Text>
        <Text style={[styles.muted, { marginVertical: 6 }]}>
          Status: {pushToken ? "Token Registered" : "Standby / Simulator"}
        </Text>
        {pushToken ? (
          <Text numberOfLines={1} style={[styles.mutedSmall, { marginBottom: 10 }]}>
            Token: {pushToken}
          </Text>
        ) : null}

        <Button
          secondary
          onPress={handleSendTestPush}
          accessibilityLabel="Dispatch test security alert notification"
        >
          {testNotificationSent
            ? "✓ Push Notification Dispatched!"
            : "🔔 Trigger Test Security Notification"}
        </Button>
      </Card>

      {/* Sign Out Card */}
      <Card>
        <Text style={styles.cardTitle}>Session Security</Text>
        <Text style={[styles.muted, { marginVertical: 6 }]}>
          Signing out clears cached session tokens from secure storage.
        </Text>

        <Button
          danger
          onPress={handleLogoutPrompt}
          accessibilityLabel="Sign out of MoMoGuard account"
        >
          Sign Out of MoMoGuard
        </Button>
      </Card>
    </Screen>
  );
}
