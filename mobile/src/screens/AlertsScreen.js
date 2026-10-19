import React, { useState } from "react";
import {
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { alertsService } from "../services/api";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  OfflineBanner,
  Screen,
  StatusBadge,
} from "../components/UI";

export default function AlertsScreen() {
  const { token } = useAuth();
  const isOnline = useNetworkStatus();
  const [resolvingId, setResolvingId] = useState(null);

  const {
    data,
    loading,
    refreshing,
    error,
    isCached,
    isOffline,
    retry,
    refresh,
  } = useApi("/alerts", token);

  async function handleResolve(alertId) {
    setResolvingId(alertId);
    try {
      await alertsService.resolve(alertId, token);
      refresh();
    } catch (err) {
      console.warn("Failed to resolve alert:", err);
    } finally {
      setResolvingId(null);
    }
  }

  if (loading && !data) {
    return (
      <Screen>
        <Header eyebrow="SECURITY MONITOR" title="Security Alerts" />
        <LoadingState message="Auditing incoming security alerts..." />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <Header eyebrow="SECURITY MONITOR" title="Security Alerts" />
        <ErrorState
          title="Could not load security alerts"
          message={error}
          onRetry={retry}
        />
      </Screen>
    );
  }

  const items = data?.items || [];
  const unreadCount = data?.unread || items.filter((a) => a.status !== "RESOLVED").length;

  return (
    <Screen
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {(!isOnline || isOffline) && (
        <OfflineBanner
          message={
            isCached
              ? "Viewing cached security alerts. Real-time notifications paused until reconnected."
              : "Offline mode active."
          }
        />
      )}

      <Header
        eyebrow="24/7 SURVEILLANCE"
        title="Security Alerts"
        subtitle={
          unreadCount > 0
            ? `You have ${unreadCount} urgent alert${unreadCount > 1 ? "s" : ""} needing review.`
            : "All security alerts have been evaluated and resolved."
        }
      />

      {items.length > 0 ? (
        items.map((alert) => {
          const isResolved = alert.status === "RESOLVED";
          const isBusy = resolvingId === alert.id;
          const formattedDate = alert.created_at
            ? new Date(alert.created_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Recent";

          return (
            <Card
              key={alert.id}
              raised={!isResolved}
              style={{
                borderColor: !isResolved ? colors.amber : colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <StatusBadge status={alert.severity || "HIGH"} />
                <Text style={styles.mutedSmall}>{formattedDate}</Text>
              </View>

              <Text style={[styles.cardTitle, { fontSize: 17 }]}>
                {alert.title}
              </Text>
              <Text style={[styles.muted, { marginVertical: 6 }]}>
                {alert.summary}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 10,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <StatusBadge status={alert.status} />

                {!isResolved ? (
                  <Button
                    secondary
                    loading={isBusy}
                    disabled={isBusy}
                    onPress={() => handleResolve(alert.id)}
                    accessibilityLabel={`Resolve alert: ${alert.title}`}
                    style={{ minHeight: 40, marginTop: 0 }}
                  >
                    Mark Resolved
                  </Button>
                ) : (
                  <Text style={[styles.positive, { fontSize: 13 }]}>
                    ✓ Confirmed Safe
                  </Text>
                )}
              </View>
            </Card>
          );
        })
      ) : (
        <Card>
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🛡️</Text>
            <Text style={styles.cardTitle}>No Active Threats Detected</Text>
            <Text style={[styles.mutedSmall, { textAlign: "center", marginTop: 4 }]}>
              MoMoGuard AI has not detected any suspicious SIM activity or anomalous transfers.
            </Text>
          </View>
        </Card>
      )}
    </Screen>
  );
}
