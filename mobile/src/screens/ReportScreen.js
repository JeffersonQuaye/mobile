import React, { useState } from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { reportsService } from "../services/api";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  Field,
  FormError,
  Header,
  OfflineBanner,
  Screen,
  StatusBadge,
} from "../components/UI";
import { formatCurrency, formatDateTime } from "../utils/formatters";
import { isValidGhanaPhone, normalizePhone } from "../utils/validators";

const FRAUD_CATEGORIES = [
  {
    id: "UNAUTHORIZED_TRANSACTION",
    label: "Unauthorized Transfer",
    description: "Money was debited without my knowledge, approval, or PIN.",
    icon: "💸",
  },
  {
    id: "PHISHING",
    label: "Phishing SMS / Link",
    description: "Fake SMS prompt, lottery alert, or spoofed login link.",
    icon: "🎣",
  },
  {
    id: "IMPERSONATION",
    label: "Fake Agent / Caller",
    description: "Caller claimed to be MTN/Telecel agent or bank official.",
    icon: "🎭",
  },
  {
    id: "WRONG_TRANSFER",
    label: "Wrong Number Transfer",
    description: "Transferred to incorrect number or recipient refuses return.",
    icon: "🔄",
  },
  {
    id: "OTHER",
    label: "Other Suspicious Activity",
    description: "SIM swap suspicion, unexplained fees, or harassment.",
    icon: "⚠️",
  },
];

export default function ReportScreen({ route, navigation }) {
  const { token, user } = useAuth();
  const isOnline = useNetworkStatus();
  const transaction = route.params?.transaction;

  const [category, setCategory] = useState("UNAUTHORIZED_TRANSACTION");
  const [description, setDescription] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submittedReport, setSubmittedReport] = useState(null);

  function validateReport() {
    const errors = {};
    if (!category) {
      errors.category = "Please choose a fraud category.";
    }
    const cleanDesc = description.trim();
    if (!cleanDesc || cleanDesc.length < 15) {
      errors.description =
        "Please provide more detail (minimum 15 characters). Explain what happened.";
    }
    if (phoneNumber.trim() && !isValidGhanaPhone(phoneNumber)) {
      errors.phone = "Please enter a valid Ghana phone number.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    setGeneralError("");
    if (!isOnline) {
      setGeneralError(
        "You are currently offline. Please connect to the internet to submit your fraud report.",
      );
      return;
    }
    if (!validateReport()) return;

    setBusy(true);
    try {
      const cleanPhone = normalizePhone(phoneNumber);
      const fullDescription = cleanPhone
        ? `${description.trim()}\n[Contact phone: ${cleanPhone}]`
        : description.trim();

      const response = await reportsService.submit(
        {
          category,
          description: fullDescription,
          transaction_id: transaction?.id || null,
        },
        token,
      );

      setSubmittedReport(response);
    } catch (err) {
      setGeneralError(
        err.message || "Failed to submit fraud report. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Success Confirmation Screen
  if (submittedReport) {
    const reportDate = formatDateTime(submittedReport.created_at, "Just now");

    return (
      <Screen scrollable>
        <View style={{ alignItems: "center", marginVertical: 20 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.greenBg,
              borderWidth: 2,
              borderColor: colors.green,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 28, color: colors.green }}>✓</Text>
          </View>
          <Text style={[styles.title, { textAlign: "center" }]}>
            Report Lodged
          </Text>
          <Text style={[styles.subtitle, { textAlign: "center" }]}>
            Your incident has been securely registered in the MoMoGuard security vault.
          </Text>
        </View>

        <Card raised>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={styles.label}>CASE RECORD</Text>
            <StatusBadge status={submittedReport.status || "REVIEW"} />
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.muted}>Case Reference:</Text>
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                #{submittedReport.id}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.muted}>Category:</Text>
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {submittedReport.category}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.muted}>Submitted At:</Text>
              <Text style={{ color: colors.text, fontSize: 12 }}>{reportDate}</Text>
            </View>
            {transaction ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.muted}>Disputed Transaction:</Text>
                <Text style={{ color: colors.text }}>#{transaction.id}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Immediate Emergency Action Advice */}
        <Card style={{ borderColor: colors.amber }}>
          <Text style={[styles.cardTitle, { color: colors.amber }]}>
            ⚠️ Immediate Next Steps
          </Text>
          <Text style={[styles.muted, { marginTop: 6, lineHeight: 22 }]}>
            1. Call your mobile operator fraud line right now:
            {"\n"}   • MTN MoMo: 100 or 0244300000
            {"\n"}   • Telecel Cash: 100
            {"\n"}   • AT Money: 100
            {"\n"}2. Request a temporary wallet freeze if your PIN was exposed.
            {"\n"}3. Save all SMS messages received as legal evidence.
          </Text>
        </Card>

        <View style={{ gap: 10, marginTop: 12 }}>
          <Button onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}>
            Back to Dashboard
          </Button>
          <Button
            secondary
            onPress={() => navigation.navigate("MainTabs", { screen: "Transactions" })}
          >
            Review Transactions
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      {/* Top back navigation */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => navigation.goBack()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
          minHeight: 44,
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 18, marginRight: 6 }}>
          ←
        </Text>
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14 }}>
          Cancel and go back
        </Text>
      </Pressable>

      <Header
        eyebrow="SECURITY INCIDENT REPORT"
        title="Report Suspicious Activity"
        subtitle="Submit an encrypted report to audit unauthorized transactions and alert telecom anti-fraud teams."
      />

      {!isOnline && (
        <OfflineBanner message="You must be online to submit an official fraud report." />
      )}

      <FormError message={generalError} />

      {/* Linked Transaction Info */}
      {transaction ? (
        <Card style={{ borderColor: colors.amber, marginBottom: 16 }}>
          <Text style={[styles.cardTitle, { color: colors.amber }]}>
            Disputed Transaction Attached
          </Text>
          <Text style={[styles.muted, { marginTop: 4 }]}>
            {transaction.merchant} • {formatCurrency(transaction.amount)}
          </Text>
          <Text style={styles.mutedSmall}>Ref: {transaction.id}</Text>
        </Card>
      ) : null}

      {/* Category Selection */}
      <Text style={styles.label}>SELECT FRAUD CATEGORY</Text>
      {fieldErrors.category ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {fieldErrors.category}
        </Text>
      ) : null}

      <View style={{ gap: 10, marginBottom: 18 }}>
        {FRAUD_CATEGORIES.map((cat) => {
          const selected = category === cat.id;
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${cat.label}: ${cat.description}`}
              onPress={() => {
                setCategory(cat.id);
                setFieldErrors((prev) => ({ ...prev, category: "" }));
              }}
              style={({ pressed }) => [
                styles.panel,
                {
                  marginBottom: 0,
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.surfaceRaised : colors.surface,
                },
                pressed && styles.pressed,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.cardTitle,
                      selected && { color: colors.accent },
                    ]}
                  >
                    {cat.label}
                  </Text>
                  <Text style={styles.mutedSmall}>{cat.description}</Text>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: selected ? colors.accent : colors.muted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.accent,
                      }}
                    />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Description input */}
      <Field
        label="Incident Description"
        placeholder="Explain what happened in detail (e.g., received suspicious call asking for OTP, unfamiliar transaction appeared...)"
        value={description}
        onChangeText={(val) => {
          setDescription(val);
          if (fieldErrors.description) {
            setFieldErrors((prev) => ({ ...prev, description: "" }));
          }
        }}
        multiline
        numberOfLines={4}
        maxLength={1000}
        error={fieldErrors.description}
        helper={`${description.length}/1000 characters (minimum 15 characters)`}
        accessibilityHint="Provide detailed information regarding the suspicious activity"
      />

      <Field
        label="Contact Phone for Follow-up"
        placeholder="e.g. 0244123456"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
        accessibilityHint="Phone number telecom fraud teams can reach you at"
      />

      <Button
        danger
        loading={busy}
        disabled={busy || !isOnline}
        onPress={handleSubmit}
        accessibilityLabel="Submit official fraud report"
      >
        {busy ? "Transmitting Report..." : "Submit Fraud Report"}
      </Button>
    </Screen>
  );
}
