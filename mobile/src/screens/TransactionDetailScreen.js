import React, { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { transactionsService } from "../services/api";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  ErrorState,
  Header,
  LoadingState,
  RiskMeter,
  Screen,
  StatusBadge,
} from "../components/UI";

export default function TransactionDetailScreen({ route, navigation }) {
  const { token } = useAuth();
  const initialTransaction = route.params?.transaction;
  const transactionId = route.params?.transactionId || initialTransaction?.id;

  const [transaction, setTransaction] = useState(initialTransaction || null);
  const [loading, setLoading] = useState(!initialTransaction && Boolean(transactionId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadDetail(isRefresh = false) {
    if (!transactionId) return;
    if (isRefresh) setRefreshing(true);
    else if (!transaction) setLoading(true);
    setError("");

    try {
      const data = await transactionsService.getById(transactionId, token);
      setTransaction(data);
    } catch (err) {
      if (!transaction) {
        setError(err.message || "Failed to load transaction details.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!initialTransaction && transactionId) {
      loadDetail();
    }
  }, [transactionId]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Fetching transaction verification..." />
      </Screen>
    );
  }

  if (error && !transaction) {
    return (
      <Screen>
        <Header eyebrow="ERROR" title="Transaction Detail" />
        <ErrorState
          title="Could not find transaction"
          message={error}
          onRetry={() => loadDetail()}
        />
        <Button secondary onPress={() => navigation.goBack()}>
          Return to Transactions
        </Button>
      </Screen>
    );
  }

  if (!transaction) {
    return (
      <Screen>
        <Header eyebrow="ERROR" title="Not Found" subtitle="Transaction unavailable." />
        <Button secondary onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </Screen>
    );
  }

  const isIncome = Number(transaction.amount) >= 0;
  const absAmount = Math.abs(Number(transaction.amount) || 0).toFixed(2);
  const currency = transaction.currency || "GHS";
  const isSuspicious =
    transaction.status === "REVIEW" ||
    transaction.status === "BLOCKED" ||
    (transaction.risk_score && transaction.risk_score > 50);

  const formattedDate = transaction.occurred_at
    ? new Date(transaction.occurred_at).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Recent transaction";

  return (
    <Screen
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDetail(true)}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* Top back navigation button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back to previous screen"
        onPress={() => navigation.goBack()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
          minHeight: 44,
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 18, marginRight: 6 }}>
          ←
        </Text>
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14 }}>
          Back to list
        </Text>
      </Pressable>

      <Header
        eyebrow="TRANSACTION INSPECTION"
        title={transaction.merchant || "Mobile Money Transfer"}
        subtitle={`Recorded on ${formattedDate}`}
      />

      {/* Primary Financial Overview Card */}
      <Card raised>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <View>
            <Text style={styles.mutedSmall}>Transfer Amount</Text>
            <Text
              accessibilityRole="text"
              accessibilityLabel={`Amount: ${isIncome ? "received" : "spent"} ${absAmount} ${currency}`}
              style={[
                styles.title,
                isIncome ? styles.positive : { color: colors.text },
                { fontSize: 32, marginVertical: 4 },
              ]}
            >
              {isIncome ? "+" : "-"} {currency} {absAmount}
            </Text>
          </View>
          <StatusBadge status={transaction.status} />
        </View>

        <RiskMeter
          score={transaction.risk_score || 0}
          level={isSuspicious ? "ELEVATED RISK" : "NORMAL"}
        />

        {isSuspicious ? (
          <View
            style={{
              backgroundColor: colors.amberBg,
              borderColor: colors.amber,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              marginTop: 10,
            }}
          >
            <Text style={{ color: colors.amber, fontWeight: "700", fontSize: 13 }}>
              ⚠️ AI Security Warning
            </Text>
            <Text style={[styles.mutedSmall, { color: colors.amber, marginTop: 4 }]}>
              This transaction exhibits behavioral anomalies or recipient risk. If you did not authorize this, file a report immediately.
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Transaction Metadata Breakdown */}
      <Card>
        <Text style={[styles.cardTitle, { marginBottom: 14 }]}>
          Audit Information
        </Text>

        {[
          ["Reference ID", transaction.id || "N/A"],
          [isIncome ? "Sender" : "Recipient", transaction.recipient || "N/A"],
          ["Transaction Type", transaction.transaction_type || "Transfer"],
          ["Location", transaction.location || "Ghana Mobile Network"],
          ["Device Used", transaction.device || "Authorized Device"],
          ["Status", transaction.status || "SAFE"],
        ].map(([label, val], idx) => (
          <View
            key={idx}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 10,
              borderBottomWidth: idx < 5 ? 1 : 0,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={styles.muted}>{label}</Text>
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontWeight: "600",
                maxWidth: "60%",
                textAlign: "right",
              }}
            >
              {val}
            </Text>
          </View>
        ))}
      </Card>

      {/* Action Buttons */}
      <View style={{ marginTop: 8, gap: 8 }}>
        <Button
          danger={isSuspicious}
          secondary={!isSuspicious}
          onPress={() => navigation.navigate("Report", { transaction })}
          accessibilityLabel="Report this transaction as fraud or suspicious"
        >
          🚨 Report Fraud / Dispute Transaction
        </Button>

        <Button
          secondary
          onPress={() =>
            navigation.navigate("MainTabs", {
              screen: "Assistant",
              params: {
                initialQuery: `Can you analyze transaction ${transaction.id} for ${transaction.merchant} of GHS ${absAmount}?`,
              },
            })
          }
          accessibilityLabel="Ask MoMoGuard AI about this transaction"
        >
          ✦ Ask MoMoGuard AI About This
        </Button>
      </View>
    </Screen>
  );
}
