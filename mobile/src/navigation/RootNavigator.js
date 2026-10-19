import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import MainTabNavigator from "./MainTabNavigator";
import AuthScreen from "../screens/AuthScreen";
import TransactionDetailScreen from "../screens/TransactionDetailScreen";
import ReportScreen from "../screens/ReportScreen";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { colors, styles } from "../theme";

const Stack = createNativeStackNavigator();

export default function RootNavigator({ navigationRef }) {
  const { isAuthenticated, loading, token } = useAuth();

  // Push notifications listener that handles deep linking on tap
  usePushNotifications(token, (payload) => {
    if (!navigationRef?.current) return;
    if (payload?.screen === "TransactionDetail" && payload?.transaction) {
      navigationRef.current.navigate("TransactionDetail", {
        transaction: payload.transaction,
      });
    } else if (payload?.screen === "Alerts") {
      navigationRef.current.navigate("MainTabs", { screen: "Alerts" });
    }
  });

  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading MoMoGuard secure session"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            color: colors.accent,
            fontSize: 44,
            marginBottom: 16,
          }}
        >
          ✦
        </Text>
        <Text
          style={[
            styles.title,
            { fontSize: 26, marginBottom: 8, textAlign: "center" },
          ]}
        >
          MoMoGuard
        </Text>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.muted, { marginTop: 16 }]}>
          Restoring secure session...
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade_from_bottom",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthScreen} />
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Report"
            component={ReportScreen}
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
