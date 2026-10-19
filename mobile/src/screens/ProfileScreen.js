import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { ENVIRONMENTS, getConfig } from "../config/env";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  Header,
  Screen,
  StatusBadge,
} from "../components/UI";

export default function ProfileScreen() {
  const { user, token, logout, switchEnvironment } = useAuth();
  const { sendTestAlert, pushToken } = usePushNotifications(token);
  const [activeConfig, setActiveConfig] = useState(getConfig());
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  async function handleEnvSwitch(envKey) {
    await switchEnvironment(envKey);
    const updated = getConfig();
    setActiveConfig(updated);
  }

  async function handleSendTestPush() {
    try {
      await sendTestAlert(
        "🚨 High-Risk Transaction Alert",
        "A withdrawal of GHS 1,200.00 from Accra New Town was flagged by AI.",
        { screen: "Alerts" },
      );
      setTestNotificationSent(true);
      setTimeout(() => setTestNotificationSent(false), 5000);
    } catch (err) {
      console.warn("Failed to trigger test notification:", err);
    }
  }

  function handleLogoutPrompt() {
    if (Platform.OS === "web") {
      if (confirm("Are you sure you want to sign out of MoMoGuard?")) {
        logout();
      }
    } else {
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
            <Text
              style={[
                styles.badgeText,
                { color: activeConfig.badgeColor },
              ]}
            >
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
                <Text
                  style={[
                    styles.filterText,
                    isSelected && styles.filterTextActive,
                  ]}
                >
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
