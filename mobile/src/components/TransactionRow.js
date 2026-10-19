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
      style={({ pressed }) => [
        styles.transactionRow,
        pressed && styles.pressed,
      ]}
    >
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

      <View style={styles.transactionCopy}>
        <Text numberOfLines={1} style={styles.transactionTitle}>
          {transaction.merchant}
        </Text>
        <Text numberOfLines={1} style={styles.mutedSmall}>
          {isIncome ? "From: " : "To: "}
          {transaction.recipient}
        </Text>
      </View>

      <View style={styles.transactionAmount}>
        <Text
          style={[
            styles.cardTitle,
            isIncome ? styles.positive : { color: colors.text },
          ]}
        >
          {signedAmount}
        </Text>
        <StatusBadge status={transaction.status} />
      </View>
    </Pressable>
  );
}
