import React, { useEffect, useState } from "react";
import {
  RefreshControl,
  Switch,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { securityService } from "../services/api";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { colors, styles } from "../theme";
import {
  Card,
  ErrorState,
  Header,
  LoadingState,
  OfflineBanner,
  RiskMeter,
  Screen,
  StatusBadge,
} from "../components/UI";

export default function SecurityScreen() {
  const { token } = useAuth();
  const isOnline = useNetworkStatus();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatingKey, setUpdatingKey] = useState(null);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else if (!data) setLoading(true);
    setError("");

    try {
      const res = await securityService.get(token);
      setData(res);
    } catch (err) {
      if (!data) {
        setError(err.message || "Failed to load security overview.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function handleToggle(key, value) {
    if (!isOnline) {
      alert("You need an internet connection to update security configurations.");
      return;
    }
    setUpdatingKey(key);
    try {
      const res = await securityService.update({ [key]: value }, token);
      setData(res);
    } catch (err) {
      setError(err.message || `Failed to update ${key}.`);
    } finally {
      setUpdatingKey(null);
    }
  }

  if (loading && !data) {
    return (
      <Screen>
        <Header eyebrow="PROTECTION OVERVIEW" title="Security Center" />
        <LoadingState message="Auditing active defense protocols..." />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <Header eyebrow="PROTECTION OVERVIEW" title="Security Center" />
        <ErrorState
          title="Could not load defense matrix"
          message={error}
          onRetry={() => load()}
        />
      </Screen>
    );
  }

  const checks = data?.checks || {};
  const score = Number(data?.score || 0);

  const securitySettings = [
    {
      key: "two_factor",
      label: "Two-Factor Authentication (2FA)",
      description: "Require an OTP verification code for high-risk access.",
    },
    {
      key: "ai_monitoring",
      label: "AI Neural Fraud Detection",
      description: "Analyze transactions in real-time with machine learning models.",
    },
    {
      key: "real_time_alerts",
      label: "Real-Time Push Notifications",
      description: "Receive instant notifications when unusual transfers occur.",
    },
  ];

  return (
    <Screen
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {!isOnline && (
        <OfflineBanner message="Offline: Security changes require an active connection." />
      )}

      <Header
        eyebrow="DEFENSE STATUS"
        title="Security Center"
        subtitle="Configure proactive fraud prevention mechanisms for your account."
      />

      {/* Score overview card */}
      <Card raised>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={styles.cardTitle}>MoMo Health Score</Text>
          <StatusBadge status={data?.level || (score >= 80 ? "SAFE" : "REVIEW")} />
        </View>

        <RiskMeter
          score={100 - score}
          level={score >= 90 ? "EXCELLENT" : score >= 60 ? "MODERATE" : "VULNERABLE"}
        />

        <Text style={[styles.muted, { marginTop: 6 }]}>
          {score >= 90
            ? "Your account has all high-priority security checkpoints enabled."
            : "Some protection layers are deactivated. Enable all switches below for maximum protection."}
        </Text>
      </Card>

      {/* Controls card */}
      <Card>
        <Text style={[styles.cardTitle, { marginBottom: 10 }]}>
          Protection Layers
        </Text>

        {securitySettings.map((item, idx) => {
          const isChecked = Boolean(checks[item.key]);
          const isBusy = updatingKey === item.key;

          return (
            <View
              key={item.key}
              style={[
                styles.settingRow,
                idx === securitySettings.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={styles.settingCopy}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.mutedSmall}>{item.description}</Text>
              </View>

              <Switch
                accessibilityRole="switch"
                accessibilityLabel={`${item.label}: currently ${
                  isChecked ? "enabled" : "disabled"
                }`}
                accessibilityState={{ checked: isChecked, busy: isBusy }}
                disabled={isBusy || !isOnline}
                onValueChange={(val) => handleToggle(item.key, val)}
                value={isChecked}
                trackColor={{ false: colors.border, true: "#287c7a" }}
                thumbColor={colors.accent}
              />
            </View>
          );
        })}
      </Card>

      {/* MoMo Security Guidelines */}
      <Card>
        <Text style={styles.cardTitle}>🔒 Ghana MoMo Safety Rules</Text>
        <Text style={[styles.muted, { marginTop: 8, lineHeight: 22 }]}>
          • Never reveal your PIN to anyone, even callers claiming to be from your network.
          {"\n"}• Always check the recipient name on your phone before approving a transfer.
          {"\n"}• Beware of fake SMS notifications claiming you won a prize or money was sent by mistake.
        </Text>
      </Card>
    </Screen>
  );
}
