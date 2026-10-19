import React, { useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { navigationTheme } from "./src/navigation/navigationTheme";

export default function App() {
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
