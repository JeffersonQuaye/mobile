import React, { useState } from "react";
import {
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { colors, styles } from "../theme";
import {
  Card,
  ErrorState,
  Header,
  LoadingState,
  OfflineBanner,
  Screen,
} from "../components/UI";
import { TransactionRow } from "../components/TransactionRow";

export default function TransactionsScreen({ navigation }) {
  const { token } = useAuth();
  const isOnline = useNetworkStatus();
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data,
    loading,
    refreshing,
    error,
    isCached,
    isOffline,
    retry,
    refresh,
  } = useApi("/transactions", token);

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "income", label: "Income (+)" },
    { key: "spending", label: "Spending (-)" },
    { key: "flagged", label: "Flagged / Review" },
  ];

  if (loading && !data) {
    return (
      <Screen>
        <Header eyebrow="YOUR ACTIVITY" title="Transactions" />
        <LoadingState message="Fetching encrypted ledger..." />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <Header eyebrow="YOUR ACTIVITY" title="Transactions" />
        <ErrorState
          title="Could not load transactions"
          message={error}
          onRetry={retry}
        />
      </Screen>
    );
  }

  const allItems = data?.items || [];
  const filteredItems = allItems.filter((item) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "income" && item.amount >= 0) ||
      (filter === "spending" && item.amount < 0) ||
      (filter === "flagged" && (item.status === "REVIEW" || item.status === "BLOCKED"));

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.merchant?.toLowerCase().includes(query) ||
      item.recipient?.toLowerCase().includes(query) ||
      String(item.id)?.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

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
              ? "Viewing cached transaction records while offline."
              : "No connection available. Offline changes will sync when online."
          }
        />
      )}

      <Header
        eyebrow="LEDGER & ACTIVITY"
        title="Transactions"
        subtitle="Review, search, and audit your Ghana mobile-money transfers."
      />

      {/* Search Input */}
      <View style={{ marginBottom: 14 }}>
        <TextInput
          accessibilityLabel="Search transactions"
          accessibilityHint="Filter transactions by merchant name, recipient number, or reference"
          placeholder="Search by merchant, number, or ref..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingVertical: 12,
            },
          ]}
        />
      </View>

      {/* Filter Tabs */}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Transaction filters"
        style={styles.filterRow}
      >
        {filterTabs.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label} transactions`}
              onPress={() => setFilter(item.key)}
              style={[styles.filter, active && styles.filterActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Transaction List */}
      <Card>
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <TransactionRow
              key={item.id}
              transaction={item}
              onPress={() =>
                navigation.navigate("TransactionDetail", { transaction: item })
              }
            />
          ))
        ) : (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>🔍</Text>
            <Text style={[styles.cardTitle, { textAlign: "center" }]}>
              No matching transactions
            </Text>
            <Text style={[styles.mutedSmall, { textAlign: "center" }]}>
              {searchQuery
                ? `No transactions matched "${searchQuery}".`
                : "No transactions found under this category filter."}
            </Text>
          </View>
        )}
      </Card>
    </Screen>
  );
}
