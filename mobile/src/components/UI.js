import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, styles } from "../theme";

export function Button({
  children,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}) {
  const label =
    accessibilityLabel || (typeof children === "string" ? children : "Action button");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={secondary ? colors.text : colors.background}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          secondary && styles.buttonSecondaryText,
          danger && styles.buttonDangerText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  error,
  helper,
  accessibilityHint,
  maxLength,
  multiline = false,
  numberOfLines = 1,
  editable = true,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry;
  const hideText = isPassword && !showPassword;

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={{ position: "relative" }}>
        <TextInput
          accessibilityLabel={label || placeholder}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ error: Boolean(error) }}
          autoCapitalize={isPassword ? "none" : "sentences"}
          autoCorrect={!isPassword}
          editable={editable}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onBlur={() => setIsFocused(false)}
          onFocus={() => setIsFocused(true)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={hideText}
          style={[
            styles.input,
            multiline && { minHeight: 90, textAlignVertical: "top" },
            isFocused && { borderColor: colors.borderActive },
            Boolean(error) && styles.inputError,
          ]}
          value={value}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword((prev) => !prev)}
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              padding: 4,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              {showPassword ? "HIDE" : "SHOW"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
      {helper && !error ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

export function Header({ eyebrow, title, subtitle }) {
  return (
    <View accessibilityRole="header" style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Screen({
  children,
  scrollable = false,
  refreshControl = null,
  contentContainerStyle,
}) {
  if (scrollable) {
    return (
      <View style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <View style={[styles.content, contentContainerStyle]}>{children}</View>
    </View>
  );
}

export function LoadingState({ message = "Loading securely..." }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      style={{ padding: 40, alignItems: "center", justifyContent: "center" }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={[styles.muted, { marginTop: 14 }]}>{message}</Text>
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}) {
  return (
    <View accessibilityRole="alert" style={styles.notice}>
      <Text style={[styles.cardTitle, { color: colors.red }]}>⚠️ {title}</Text>
      <Text style={[styles.muted, { marginBottom: 12 }]}>{message}</Text>
      {onRetry ? (
        <Button secondary onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </View>
  );
}

export function OfflineBanner({
  message = "You are currently offline. Showing cached records.",
}) {
  return (
    <View accessibilityRole="alert" style={styles.offlineNotice}>
      <Text style={{ fontSize: 18 }}>📡</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.amber, fontWeight: "700", fontSize: 13 }}>
          Offline Mode
        </Text>
        <Text style={[styles.mutedSmall, { color: colors.amber }]}>
          {message}
        </Text>
      </View>
    </View>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        backgroundColor: colors.redBg,
        borderColor: colors.red,
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: colors.red, fontWeight: "600", fontSize: 13 }}>
        ⚠️ {message}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }) {
  const norm = String(status || "").toUpperCase();
  let bg = colors.blueBg;
  let border = colors.blue;
  let text = colors.blue;

  if (norm === "SAFE" || norm === "RESOLVED") {
    bg = colors.greenBg;
    border = colors.green;
    text = colors.green;
  } else if (norm === "REVIEW" || norm === "HIGH" || norm === "PENDING") {
    bg = colors.amberBg;
    border = colors.amber;
    text = colors.amber;
  } else if (norm === "BLOCKED" || norm === "CRITICAL" || norm === "FRAUD") {
    bg = colors.redBg;
    border = colors.red;
    text = colors.red;
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${norm}`}
      style={[styles.badge, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[styles.badgeText, { color: text }]}>{norm}</Text>
    </View>
  );
}

export function RiskMeter({ score = 0, level = "LOW" }) {
  const clamped = Math.min(Math.max(score, 0), 100);
  let color = colors.green;
  if (clamped >= 70) color = colors.red;
  else if (clamped >= 35) color = colors.amber;

  return (
    <View style={styles.riskMeterContainer}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={styles.label}>AI Fraud Risk Assessment</Text>
        <Text style={{ color, fontWeight: "800", fontSize: 14 }}>
          {clamped}% ({level || (clamped >= 70 ? "HIGH" : clamped >= 35 ? "MEDIUM" : "LOW")})
        </Text>
      </View>
      <View style={styles.riskMeterTrack}>
        <View
          style={[
            styles.riskMeterFill,
            { width: `${clamped}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

export function Card({ children, style, raised = false }) {
  return (
    <View style={[raised ? styles.panelRaised : styles.panel, style]}>
      {children}
    </View>
  );
}
