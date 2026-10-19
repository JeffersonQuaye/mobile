import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, Text, View } from "react-native";
import HomeScreen from "../screens/HomeScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import AlertsScreen from "../screens/AlertsScreen";
import SecurityScreen from "../screens/SecurityScreen";
import AssistantScreen from "../screens/AssistantScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { colors } from "../theme";

const Tabs = createBottomTabNavigator();

function TabIcon({ symbol, focused }) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 4,
      }}
    >
      <Text
        style={{
          fontSize: 20,
          color: focused ? colors.accent : colors.muted,
          transform: [{ scale: focused ? 1.15 : 1 }],
        }}
      >
        {symbol}
      </Text>
    </View>
  );
}

export default function MainTabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 68,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarAccessibilityLabel: "Home tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="⌂" focused={focused} label="Home" />
          ),
        }}
      />
      <Tabs.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          tabBarLabel: "Transactions",
          tabBarAccessibilityLabel: "Transactions tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="⇄" focused={focused} label="Transactions" />
          ),
        }}
      />
      <Tabs.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarLabel: "Alerts",
          tabBarAccessibilityLabel: "Security Alerts tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="⚠" focused={focused} label="Alerts" />
          ),
        }}
      />
      <Tabs.Screen
        name="Security"
        component={SecurityScreen}
        options={{
          tabBarLabel: "Security",
          tabBarAccessibilityLabel: "Security Center tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="🛡" focused={focused} label="Security" />
          ),
        }}
      />
      <Tabs.Screen
        name="Assistant"
        component={AssistantScreen}
        options={{
          tabBarLabel: "AI Assist",
          tabBarAccessibilityLabel: "AI Security Assistant tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="✦" focused={focused} label="Assistant" />
          ),
        }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "User Profile and settings tab",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="👤" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}
