import React from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  OfflineBanner,
  RiskMeter,
  Screen,
} from "../components/UI";
import { TransactionRow } from "../components/TransactionRow";
import { formatCurrency, getFirstName } from "../utils/formatters";

export default function HomeScreen({ navigation }) {
  const { user, token } = useAuth();
  const isOnline = useNetworkStatus();

  const {
    data: dashboardData,
    loading: dashboardLoading,
    refreshing,
    error: dashboardError,
    isCached,
    isOffline,
    retry,
    refresh,
  } = useApi("/dashboard", token);

  const {
    data: txData,
  } = useApi("/transactions", token);

  const firstName = getFirstName(user?.full_name);

  if (dashboardLoading && !dashboardData) {
    return (
      <Screen>
        <LoadingState message="Connecting to MoMoGuard protection core..." />
      </Screen>
    );
  }

  if (dashboardError && !dashboardData) {
    return (
      <Screen>
        <Header
          eyebrow="DASHBOARD"
          title={`Hello, ${firstName}`}
          subtitle="Your MoMo account overview."
        />
        <ErrorState
          title="Could not retrieve wallet status"
          message={dashboardError}
          onRetry={retry}
        />
      </Screen>
    );
  }

  const balance = formatCurrency(dashboardData?.balance);
  const income = formatCurrency(dashboardData?.income);
  const spending = formatCurrency(dashboardData?.spending);
  const securityScore = Number(dashboardData?.security_score || 0);
  const recentTransactions = (txData?.items || []).slice(0, 3);

  return (
    <Screen
      scrollable
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {(!isOnline || isOffline) && (
        <OfflineBanner
          message={
            isCached
              ? "You are currently offline. Viewing last synchronized wallet data."
              : "No internet connection detected. Some real-time features may be limited."
          }
        />
      )}

      <Header
        eyebrow="OVERVIEW"
        title={`Hello, ${firstName}`}
        subtitle="Your mobile-money activity is under 24/7 AI supervision."
      />

      {/* Main Balance Card */}
      <Card>
        <Text style={styles.label}>ESTIMATED AVAILABLE BALANCE</Text>
        <Text
          accessibilityRole="text"
          accessibilityLabel={`Available balance: ${balance}`}
          style={{
            color: colors.text,
            fontSize: 34,
            fontWeight: "800",
            letterSpacing: -0.5,
            marginVertical: 4,
          }}
        >
          {balance}
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View>
            <Text style={styles.mutedSmall}>Total Inflows</Text>
            <Text style={[styles.positive, { fontSize: 16 }]}>+ {income}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.mutedSmall}>Total Outflows</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
              - {spending}
            </Text>
          </View>
        </View>
      </Card>

      {/* Security Health Card */}
      <Card raised>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={styles.cardTitle}>Security Shield</Text>
          <Text
            style={{
              color: securityScore >= 80 ? colors.green : colors.amber,
              fontWeight: "800",
              fontSize: 15,
            }}
          >
            {securityScore}/100
          </Text>
        </View>

        <RiskMeter
          score={100 - securityScore}
          level={securityScore >= 80 ? "LOW RISK" : "ATTENTION NEEDED"}
        />

        <Text style={[styles.muted, { marginVertical: 8 }]}>
          {securityScore >= 80
            ? "Two-Factor Auth and AI monitoring are active."
            : "Some protection layers are disabled. Review your security settings."}
        </Text>

        <Button
          secondary
          onPress={() => navigation.navigate("Security")}
          accessibilityLabel="Review security center settings"
        >
          Open Security Center
        </Button>
      </Card>

      {/* Quick Action Buttons */}
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report Suspicious Activity"
          onPress={() => navigation.navigate("Report")}
          style={({ pressed }) => [
            styles.panel,
            {
              flex: 1,
              marginBottom: 0,
              padding: 14,
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.amber,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={{ fontSize: 20, marginBottom: 4 }}>🚨</Text>
          <Text style={[styles.cardTitle, { fontSize: 13, color: colors.amber }]}>
            Report Fraud
          </Text>
          <Text style={styles.mutedSmall}>File an alert</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask MoMoGuard AI Assistant"
          onPress={() => navigation.navigate("Assistant")}
          style={({ pressed }) => [
            styles.panel,
            {
              flex: 1,
              marginBottom: 0,
              padding: 14,
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.accent,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={{ fontSize: 20, marginBottom: 4 }}>✦</Text>
          <Text style={[styles.cardTitle, { fontSize: 13, color: colors.accent }]}>
            Ask AI Assistant
          </Text>
          <Text style={styles.mutedSmall}>Fraud analysis</Text>
        </Pressable>
      </View>

      {/* Recent Transactions Preview */}
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Text style={styles.cardTitle}>Recent Activity</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View all transactions"
            onPress={() => navigation.navigate("Transactions")}
            style={{ padding: 6, minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              See All →
            </Text>
          </Pressable>
        </View>

        {txLoading && !recentTransactions.length ? (
          <LoadingState message="Loading recent activity..." />
        ) : recentTransactions.length > 0 ? (
          recentTransactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              onPress={() =>
                navigation.navigate("TransactionDetail", { transaction: tx })
              }
            />
          ))
        ) : (
          <Text style={[styles.muted, { paddingVertical: 12 }]}>
            No recent transactions found.
          </Text>
        )}
      </Card>
    </Screen>
  );
}
