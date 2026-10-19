import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { authService } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { colors, styles } from "../theme";
import { Button, Field, FormError, Header } from "../components/UI";
import {
  isValidEmail,
  isValidGhanaPhone,
  normalizePhone,
} from "../utils/validators";

export default function AuthScreen() {
  const { login } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    code: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [challenge, setChallenge] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);
  const [generalError, setGeneralError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    }
    if (generalError) {
      setGeneralError("");
    }
  };

  function validateAuthForm() {
    const errors = {};
    if (registering) {
      if (!form.name.trim() || form.name.trim().length < 2) {
        errors.name = "Please enter your full legal name.";
      }
      if (!isValidGhanaPhone(form.phone)) {
        errors.phone = "Enter a valid Ghana phone (e.g., 0244123456 or +233244123456).";
      }
    }

    if (!isValidEmail(form.email)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!form.password || form.password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateCode() {
    const cleanCode = form.code.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setFieldErrors({ code: "Please enter the complete 6-digit numerical code." });
      return false;
    }
    setFieldErrors({});
    return true;
  }

  async function handleSubmit() {
    setGeneralError("");
    if (!validateAuthForm()) return;

    setBusy(true);
    try {
      const cleanEmail = form.email.trim().toLowerCase();
      const payload = registering
        ? {
            full_name: form.name.trim(),
            phone: normalizePhone(form.phone),
            email: cleanEmail,
            password: form.password,
          }
        : {
            email: cleanEmail,
            password: form.password,
          };

      const result = registering
        ? await authService.register(payload)
        : await authService.login(payload);

      if (result.requires_phone_verification || result.requires_2fa) {
        setChallenge({
          purpose: result.requires_phone_verification ? "phone" : "2fa",
          token: result.challenge_token,
        });
        setPendingUser(result.user);
        setForm((prev) => ({ ...prev, code: "" }));
      } else {
        await login(result.user, result.token, result.refresh_token);
      }
    } catch (requestError) {
      setGeneralError(requestError.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setGeneralError("");
    if (!validateCode()) return;

    setBusy(true);
    try {
      const payload = {
        challenge_token: challenge.token,
        code: form.code.trim(),
      };

      const result =
        challenge.purpose === "phone"
          ? await authService.verifyPhone(payload)
          : await authService.verify2Fa(payload);

      if (result.requires_2fa) {
        setChallenge({ purpose: "2fa", token: result.challenge_token });
        update("code", "");
      } else {
        await login(
          result.user || pendingUser,
          result.token,
          result.refresh_token,
        );
      }
    } catch (requestError) {
      setGeneralError(requestError.message || "Verification code failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.safe}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { justifyContent: "center" }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 24, marginTop: 20 }}>
          <Text
            accessibilityRole="text"
            accessibilityLabel="MoMoGuard Logo"
            style={{ color: colors.accent, fontSize: 40, marginBottom: 8 }}
          >
            ✦
          </Text>
          <Text style={[styles.title, { textAlign: "center", marginBottom: 4 }]}>
            MoMoGuard
          </Text>
          <Text style={[styles.mutedSmall, { textAlign: "center", letterSpacing: 1 }]}>
            SECURE MOBILE-MONEY GUARDIAN
          </Text>
        </View>

        {challenge ? (
          <View accessibilityRole="region" accessibilityLabel="Verification form">
            <Header
              eyebrow={
                challenge.purpose === "phone"
                  ? "PHONE VERIFICATION"
                  : "TWO-FACTOR AUTHENTICATION"
              }
              title="Verify your identity"
              subtitle="Enter the 6-digit one-time code sent to your registered device."
            />
            <FormError message={generalError} />

            <Field
              label="6-Digit Verification Code"
              placeholder="e.g. 123456"
              value={form.code}
              onChangeText={(val) => update("code", val.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              error={fieldErrors.code}
              accessibilityHint="Enter the 6 digits sent to your phone"
            />

            <Button
              loading={busy}
              disabled={busy}
              onPress={handleVerify}
              accessibilityHint="Verifies code and signs into account"
            >
              {busy ? "Verifying..." : "Confirm & Continue"}
            </Button>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              onPress={() => {
                setChallenge(null);
                setGeneralError("");
                setFieldErrors({});
              }}
              style={{ marginTop: 20, alignSelf: "center", minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                ← Return to Sign In
              </Text>
            </Pressable>
          </View>
        ) : (
          <View accessibilityRole="region" accessibilityLabel="Sign in or registration form">
            <Header
              eyebrow={registering ? "NEW ACCOUNT" : "SECURE LOGIN"}
              title={registering ? "Protect your mobile money" : "Welcome back"}
              subtitle={
                registering
                  ? "Create an account to safeguard your Ghana mobile-money transactions with real-time AI."
                  : "Sign in with your credentials to monitor your wallet."
              }
            />

            <FormError message={generalError} />

            {registering ? (
              <>
                <Field
                  label="Full Legal Name"
                  placeholder="e.g. Master Kojo Mensah"
                  value={form.name}
                  onChangeText={(val) => update("name", val)}
                  error={fieldErrors.name}
                  accessibilityHint="Enter your full name as registered with your mobile money provider"
                />
                <Field
                  label="Ghana Phone Number"
                  placeholder="e.g. 0244123456 or +233244123456"
                  value={form.phone}
                  onChangeText={(val) => update("phone", val)}
                  keyboardType="phone-pad"
                  error={fieldErrors.phone}
                  helper="Used for MoMo transaction monitoring and SMS verification"
                  accessibilityHint="Enter your 10-digit Ghana mobile money phone number"
                />
              </>
            ) : null}

            <Field
              label="Email Address"
              placeholder="e.g. user@example.com"
              value={form.email}
              onChangeText={(val) => update("email", val)}
              keyboardType="email-address"
              error={fieldErrors.email}
              accessibilityHint="Enter your registered account email"
            />

            <Field
              label="Password"
              placeholder="At least 8 characters"
              value={form.password}
              onChangeText={(val) => update("password", val)}
              secureTextEntry
              error={fieldErrors.password}
              helper={registering ? "Must contain at least 8 characters" : undefined}
              accessibilityHint="Enter your account password"
            />

            <Button
              loading={busy}
              disabled={busy}
              onPress={handleSubmit}
              accessibilityHint={
                registering
                  ? "Submits registration form"
                  : "Signs into your account"
              }
            >
              {busy
                ? "Processing..."
                : registering
                  ? "Create Protected Account"
                  : "Sign In Securely"}
            </Button>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                registering
                  ? "Switch to sign in"
                  : "Switch to create account"
              }
              onPress={() => {
                setRegistering((prev) => !prev);
                setGeneralError("");
                setFieldErrors({});
              }}
              style={{
                marginTop: 20,
                alignSelf: "center",
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: "700", textAlign: "center" }}>
                {registering
                  ? "Already have an account? Sign In"
                  : "New to MoMoGuard? Create an Account"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
