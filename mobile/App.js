/**
 * MoMoGuard Mobile Application - Root Entry Point
 * -----------------------------------------------
 * This is the top-level React component that bootstraps the MoMoGuard mobile client.
 *
 * It provides the core application providers:
 * 1. SafeAreaProvider: Ensures content respects device notches, status bars, and home indicators.
 * 2. AuthProvider: Supplies global authentication state, tokens, and login/logout methods.
 * 3. NavigationContainer: Configures the React Navigation tree with a tailored dark security theme.
 * 4. StatusBar: Configures a high-contrast light status bar for dark UI backgrounds.
 * 5. RootNavigator: Conditionally renders the Auth flow or Main Tab Navigator based on session state.
 */

import React, { useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { navigationTheme } from "./src/navigation/navigationTheme";

export default function App() {
  // Navigation reference allows programmatic navigation from notification handlers or background services
  const navigationRef = useRef(null);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <StatusBar style="light" />
          <RootNavigator navigationRef={navigationRef} />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
