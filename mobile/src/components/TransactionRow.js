/**
 * MoMoGuard Transaction Row Component
 * ------------------------------------
 * Displays an individual mobile money transfer item within list views.
 *
 * Features:
 * 1. Visual Directional Indicator: Displays green incoming arrow (⇣) or raised outgoing arrow (⇡).
 * 2. Signed Amount: Formats monetary amount with sign and currency (+ GHS 50.00 / - GHS 20.00).
 * 3. Status Badge: Displays color-coded risk/decision tag (SAFE, REVIEW, BLOCKED).
 * 4. Screen Reader Accessibility: Full descriptive accessibility label summarizing merchant,
 *    amount, flow direction, recipient, and status.
 */

import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, styles } from "../theme";
import { StatusBadge } from "./UI";
import { formatAmount, formatSignedCurrency } from "../utils/formatters";

export function TransactionRow({ transaction, onPress }) {
  const isIncome = Number(transaction.amount) >= 0;
  const currency = transaction.currency || "GHS";
  const formattedAmount = formatAmount(transaction.amount);
  const signedAmount = formatSignedCurrency(transaction.amount, currency);

  const accessibilityLabel = `${transaction.merchant || "Transaction"}, ${
    isIncome ? "received" : "spent"
  } ${formattedAmount} ${currency}, recipient ${
    transaction.recipient || "unknown"
  }, status ${transaction.status || "SAFE"}. Tap for transaction details.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Navigates to transaction detail and security analysis screen"
      onPress={onPress}
      style={({ pressed }) => [styles.transactionRow, pressed && styles.pressed]}
    >
      {/* Direction Icon Badge */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isIncome ? colors.greenBg : colors.surfaceRaised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 16 }}>{isIncome ? "⇣" : "⇡"}</Text>
      </View>

      {/* Transaction Merchant & Recipient Details */}
      <View style={styles.transactionCopy}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.merchant}
        </Text>
        <Text numberOfLines={1} style={styles.mutedSmall}>
          {isIncome ? "From: " : "To: "}
          {transaction.recipient}
        </Text>
      </View>

      {/* Signed Amount & Risk Status */}
      <View style={styles.transactionAmount}>
        <Text
          style={[styles.cardTitle, isIncome ? styles.positive : { color: colors.text }]}
        >
          {signedAmount}
        </Text>
        <StatusBadge status={transaction.status} />
      </View>
    </Pressable>
  );
}
