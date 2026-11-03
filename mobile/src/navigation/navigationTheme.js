/**
 * MoMoGuard React Navigation Theme Configuration
 * ----------------------------------------------
 * Adapts React Navigation's default theme to match MoMoGuard's dark cybersecurity aesthetic.
 * Configures background, surface cards, primary accents, borders, and notification badges.
 */

import { DefaultTheme } from "@react-navigation/native";
import { colors } from "../theme";

export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.red,
  },
};
