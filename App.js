import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

const API_BASE = "http://10.0.2.2:5000/api";
const COLORS = {
  bg: "#07131f",
  panel: "#0d1f2b",
  panel2: "#122a38",
  ink: "#eff7f6",
  muted: "#8fa6ac",
  cyan: "#50d5d0",
  green: "#79d7a1",
  amber: "#efbd68",
  red: "#f47b83",
  line: "rgba(182,218,219,.14)",
};

async function api(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function Button({ children, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[styles.buttonText, secondary && styles.buttonSecondaryText]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  inputMode,
  maxLength,
}) {
  const resolvedInputMode =
    inputMode ??
    (keyboardType === "email-address"
      ? "email"
      : keyboardType === "phone-pad"
        ? "tel"
        : "text");

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        inputMode={resolvedInputMode}
        maxLength={maxLength}
        autoCapitalize={secureTextEntry ? "none" : "words"}
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={COLORS.muted}
        style={styles.input}
      />
    </View>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false);
  const [verificationStep, setVerificationStep] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("jefferson@example.com");
  const [password, setPassword] = useState("DemoPass123!");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (registering && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(
          registering
            ? { full_name: name, phone, email, password }
            : { email, password },
        ),
      });

      if (result.requires_phone_verification || result.requires_2fa) {
        setPendingToken(result.token);
        setPendingUser(result.user);
        setVerificationStep(
          result.requires_phone_verification ? "phone" : "2fa",
        );
        setDemoCode(result.demo_code || "");
        setOtp("");
        return;
      }

      await AsyncStorage.multiSet([
        ["momoguard_token", result.token],
        ["momoguard_user", JSON.stringify(result.user)],
      ]);
      onAuthenticated(result.user, result.token);
    } catch (requestError) {
      setError(
        requestError.message === "Network request failed"
          ? "Cannot reach the Flask API. Start the backend and check the API address."
          : requestError.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerification() {
    if (!pendingToken || !verificationStep) return;
    setError("");
    setBusy(true);
    try {
      const endpoint =
        verificationStep === "phone"
          ? "/auth/verify-phone"
          : "/auth/verify-2fa";
      const result = await api(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ code: otp }),
        },
        pendingToken,
      );

      await AsyncStorage.multiSet([
        ["momoguard_token", pendingToken],
        ["momoguard_user", JSON.stringify(pendingUser)],
      ]);
      onAuthenticated(pendingUser, pendingToken);
      setVerificationStep(null);
      setOtp("");
      setDemoCode("");
      setPendingToken("");
      setPendingUser(null);
      setError(result.message || "Verification complete.");
    } catch (requestError) {
      setError(
        requestError.message === "Network request failed"
          ? "Cannot reach the Flask API. Start the backend and check the API address."
          : requestError.message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (verificationStep) {
    return (
      <SafeAreaView style={styles.authScreen}>
        <View style={styles.authCard}>
          <View style={styles.brand}>
            <Text style={styles.brandMark}>*</Text>
            <Text style={styles.brandText}>MoMoGuard</Text>
          </View>
          <Text style={styles.eyebrow}>VERIFY ACCOUNT</Text>
          <Text style={styles.title}>
            {verificationStep === "phone"
              ? "Verify phone number"
              : "Two-factor verification"}
          </Text>
          <Text style={styles.muted}>
            {verificationStep === "phone"
              ? "Enter the 6-digit code sent to your phone number."
              : "Enter the 6-digit code sent to your authenticator or SMS channel."}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {demoCode ? (
            <Text style={styles.demoCode}>Demo code: {demoCode}</Text>
          ) : null}
          <Field
            label="Verification code"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
          />
          <Button
            onPress={handleVerification}
            disabled={busy || otp.length !== 6}
          >
            {busy ? "Verifying..." : "Confirm code"}
          </Button>
          <Pressable
            onPress={() => {
              setVerificationStep(null);
              setOtp("");
              setError("");
            }}
            accessibilityRole="button"
          >
            <Text style={styles.switchText}>Back to sign in</Text>
          </Pressable>
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.authScreen}>
      <View style={styles.authCard}>
        <View style={styles.brand}>
          <Text style={styles.brandMark}>*</Text>
          <Text style={styles.brandText}>MoMoGuard</Text>
        </View>
        <Text style={styles.eyebrow}>
          {registering ? "JOIN MOMOGUARD" : "SECURE ACCESS"}
        </Text>
        <Text style={styles.title}>
          {registering ? "Protect your money" : "Welcome back"}
        </Text>
        <Text style={styles.muted}>
          {registering
            ? "Create your account and let AI watch over every transaction."
            : "Sign in to keep watch over your mobile money."}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {registering ? (
          <>
            <Field label="Full name" value={name} onChangeText={setName} />
            <Field
              label="Ghana phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              inputMode="tel"
            />
          </>
        ) : null}
        <Field
          label={registering ? "Email" : "Email or phone"}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          inputMode="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <>
          {registering ? (
            <Field
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
            />
          ) : null}
        </>
        <Button onPress={submit} disabled={busy}>
          {busy
            ? "Please wait..."
            : registering
              ? "Create account"
              : "Sign in securely"}
        </Button>
        <Pressable
          onPress={() => {
            setRegistering(!registering);
            setError("");
          }}
          accessibilityRole="button"
          accessibilityLabel={
            registering ? "Switch to sign in form" : "Switch to register form"
          }
        >
          <Text style={styles.switchText}>
            {registering
              ? "Already have an account? Sign in"
              : "New to MoMoGuard? Create an account"}
          </Text>
        </Pressable>
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

function Home({ user, navigate }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TUESDAY, 9 SEPTEMBER</Text>
      <Text style={styles.title}>
        Good morning, {(user.full_name || "Jefferson").split(" ")[0]}
      </Text>
      <Text style={styles.muted}>Your money is being watched over.</Text>
      <View style={styles.status}>
        <View style={styles.statusDot} />
        <View>
          <Text style={styles.cardTitle}>Your account is protected</Text>
          <Text style={styles.mutedSmall}>Last security check: Just now</Text>
        </View>
      </View>
      <View style={styles.balance}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.mutedSmall}>Available balance</Text>
            <Text style={styles.balanceValue}>GHS 4,250.00</Text>
          </View>
          <Text style={styles.live}>LIVE</Text>
        </View>
        <View style={styles.moneyRow}>
          <View>
            <Text style={styles.mutedSmall}>Income</Text>
            <Text style={styles.income}>+ GHS 5,400</Text>
          </View>
          <View>
            <Text style={styles.mutedSmall}>Spending</Text>
            <Text style={styles.warning}>- GHS 1,150</Text>
          </View>
        </View>
      </View>
      <SectionTitle
        title="AI security score"
        action="View analysis"
        onPress={() => navigate("security")}
      />
      <View style={styles.riskCard}>
        <View style={styles.gauge}>
          <Text style={styles.gaugeText}>92</Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>LOW RISK</Text>
          <Text style={styles.cardTitle}>Recent activity looks normal</Text>
          <Text style={styles.mutedSmall}>
            MoMoGuard AI checked 18 signals today.
          </Text>
        </View>
      </View>
      <SectionTitle title="Quick actions" />
      <View style={styles.actionGrid}>
        <Action
          title="Check transaction"
          subtitle="Analyze before you send."
          onPress={() => navigate("analysis")}
        />
        <Action
          title="Transactions"
          subtitle="Review your activity."
          onPress={() => navigate("transactions")}
        />
        <Action
          title="Report fraud"
          subtitle="Tell our security team."
          onPress={() => navigate("alerts")}
        />
        <Action
          title="AI assistant"
          subtitle="Ask anything securely."
          onPress={() => navigate("assistant")}
        />
      </View>
    </ScrollView>
  );
}

function SectionTitle({ title, action, onPress }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {action ? (
        <Pressable onPress={onPress}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function Action({ title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Text style={styles.actionIcon}>*</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.mutedSmall}>{subtitle}</Text>
    </Pressable>
  );
}

function Transactions({ token, navigate }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    api("/transactions", {}, token)
      .then((result) => setItems(result.items))
      .catch((requestError) => setError(requestError.message));
  }, [token]);
  const visible = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "income" && item.amount >= 0) ||
      (filter === "spending" && item.amount < 0) ||
      (filter === "flagged" && item.status === "REVIEW"),
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR ACTIVITY</Text>
      <Text style={styles.title}>Transactions</Text>
      <View style={styles.filters}>
        {["all", "income", "spending", "flagged"].map((option) => (
          <Pressable
            key={option}
            onPress={() => setFilter(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === option }}
            style={[styles.filter, filter === option && styles.filterActive]}
          >
            <Text style={filter === option ? styles.link : styles.muted}>
              {option[0].toUpperCase() + option.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : visible.length ? (
        visible.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => navigate("transaction", item)}
            style={styles.panel}
          >
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>{item.merchant}</Text>
                <Text style={styles.mutedSmall}>{item.recipient}</Text>
                <Text style={styles.mutedSmall}>{item.occurred_at}</Text>
              </View>
              <View>
                <Text
                  style={item.amount >= 0 ? styles.income : styles.cardTitle}
                >
                  {item.amount >= 0 ? "+" : "-"} GHS{" "}
                  {Math.abs(item.amount).toFixed(2)}
                </Text>
                <Text
                  style={
                    item.status === "REVIEW" ? styles.critical : styles.safe
                  }
                >
                  {item.status === "REVIEW" ? "Review" : "Safe"}
                </Text>
              </View>
            </View>
          </Pressable>
        ))
      ) : (
        <Empty message="No transactions found in this category." />
      )}
    </ScrollView>
  );
}

function Security({ token, navigate }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/security", {}, token)
      .then(setState)
      .catch((requestError) => setError(requestError.message));
  }, [token]);
  async function toggle(key, value) {
    try {
      setState(
        await api(
          "/security",
          { method: "PUT", body: JSON.stringify({ [key]: value }) },
          token,
        ),
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>PROTECTION OVERVIEW</Text>
      <Text style={styles.title}>Security center</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.securityScore}>
        <View style={styles.gauge}>
          <Text style={styles.gaugeText}>{state?.score ?? "--"}</Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>{state?.level || "CHECKING"}</Text>
          <Text style={styles.cardTitle}>Your protections</Text>
          <Text style={styles.mutedSmall}>
            Keep these protections turned on.
          </Text>
        </View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.cardTitle}>Account security</Text>
        <SecurityToggle
          label="Two-factor authentication"
          value={state?.checks.two_factor}
          onChange={(value) => toggle("two_factor", value)}
        />
        <SecurityRow label="Verified phone number" value="Verified" />
      </View>
      <View style={styles.panel}>
        <Text style={styles.cardTitle}>Device security</Text>
        <SecurityToggle
          label="AI monitoring"
          value={state?.checks.ai_monitoring}
          onChange={(value) => toggle("ai_monitoring", value)}
        />
        <SecurityToggle
          label="Real-time fraud alerts"
          value={state?.checks.real_time_alerts}
          onChange={(value) => toggle("real_time_alerts", value)}
        />
      </View>
      <Button secondary onPress={() => navigate("profile-devices")}>
        Manage trusted devices
      </Button>
    </ScrollView>
  );
}
function SecurityToggle({ label, value, onChange }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.cardTitle}>{label}</Text>
      <Switch
        value={Boolean(value)}
        onValueChange={onChange}
        trackColor={{ false: "#30434b", true: COLORS.cyan }}
        thumbColor={COLORS.ink}
      />
    </View>
  );
}
function SecurityRow({ label, value }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.cardTitle}>{label}</Text>
      <Text style={styles.safe}>{value}</Text>
    </View>
  );
}
function Alerts({ token, navigate }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    api("/alerts", {}, token)
      .then((result) => setItems(result.items))
      .catch(() => {});
  }, [token]);
  const visible = items.filter(
    (item) =>
      filter === "all" ||
      item.severity === filter ||
      (filter === "resolved" && item.status === "RESOLVED"),
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>STAY INFORMED</Text>
      <Text style={styles.title}>Alerts</Text>
      <View style={styles.filters}>
        {["all", "CRITICAL", "HIGH", "resolved"].map((option) => (
          <Pressable
            key={option}
            onPress={() => setFilter(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === option }}
            style={[styles.filter, filter === option && styles.filterActive]}
          >
            <Text style={filter === option ? styles.link : styles.muted}>
              {option === "all"
                ? "All"
                : option[0] + option.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {visible.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => navigate("alert", item)}
          style={[
            styles.panel,
            item.severity === "CRITICAL" && styles.criticalPanel,
          ]}
        >
          <View style={styles.rowBetween}>
            <Text
              style={
                item.severity === "CRITICAL" ? styles.critical : styles.warning
              }
            >
              {item.severity} alert
            </Text>
            <Text style={styles.mutedSmall}>{item.status}</Text>
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.mutedSmall}>{item.summary}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
function Profile({ user, navigate, onSignOut }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.profile}>
        <Text style={styles.avatar}>JD</Text>
        <View>
          <Text style={styles.cardTitle}>{user.full_name}</Text>
          <Text style={styles.mutedSmall}>{user.phone}</Text>
          <Text style={styles.mutedSmall}>{user.email}</Text>
        </View>
      </View>
      {[
        ["Personal information", "profile-personal"],
        ["Trusted devices", "profile-devices"],
        ["Notifications", "profile-notifications"],
        ["Appearance", "profile-appearance"],
        ["Help center", "profile-help"],
        ["Privacy & terms", "profile-legal"],
      ].map(([label, screen]) => (
        <Pressable
          key={screen}
          onPress={() => navigate(screen)}
          style={styles.menu}
        >
          <Text style={styles.menuIcon}>*</Text>
          <Text style={styles.cardTitle}>{label}</Text>
          <Text style={styles.link}>›</Text>
        </Pressable>
      ))}
      <Button secondary onPress={onSignOut}>
        Sign out securely
      </Button>
    </ScrollView>
  );
}
function Detail({ transaction, alert, token, navigate }) {
  const [message, setMessage] = useState("");
  if (transaction)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Back onPress={() => navigate("transactions")} title="Transactions" />
        <Text style={styles.title}>Transaction details</Text>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>
            {transaction.status === "REVIEW"
              ? "POTENTIALLY SUSPICIOUS"
              : "TRANSACTION"}
          </Text>
          <Text style={styles.sectionHeading}>{transaction.merchant}</Text>
          <Text style={styles.balanceValue}>
            GHS {Math.abs(transaction.amount).toFixed(2)}
          </Text>
          <SecurityRow label="Recipient" value={transaction.recipient} />
          <SecurityRow label="Transaction ID" value={transaction.id} />
          <SecurityRow
            label="Risk score"
            value={`${transaction.risk_score}%`}
          />
        </View>
        <Button onPress={() => navigate("analysis", transaction)}>
          Run AI analysis
        </Button>
        <Button secondary onPress={() => navigate("alerts")}>
          Report fraud
        </Button>
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Back onPress={() => navigate("alerts")} title="Alerts" />
      <Text style={styles.title}>Investigate alert</Text>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>{alert?.severity} ALERT</Text>
        <Text style={styles.sectionHeading}>{alert?.title}</Text>
        <Text style={styles.muted}>{alert?.summary}</Text>
      </View>
      <Button
        onPress={async () => {
          await api(
            `/alerts/${alert.id}`,
            { method: "PUT", body: JSON.stringify({ status: "RESOLVED" }) },
            token,
          );
          setMessage("Alert resolved");
        }}
      >
        Resolve alert
      </Button>
      {message ? <Text style={styles.safe}>{message}</Text> : null}
    </ScrollView>
  );
}
function Back({ onPress, title }) {
  return (
    <Pressable onPress={onPress}>
      <Text style={styles.link}>‹ {title}</Text>
    </Pressable>
  );
}
function Empty({ message }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.gaugeText}>OK</Text>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

function ProfilePage({ screen, user, token, navigate }) {
  if (screen === "profile-devices")
    return <Devices token={token} navigate={navigate} />;
  const titles = {
    "profile-personal": "Personal information",
    "profile-notifications": "Notifications",
    "profile-appearance": "Appearance",
    "profile-help": "Help center",
    "profile-legal": "Privacy & terms",
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Back onPress={() => navigate("profile")} title="Profile" />
      <Text style={styles.title}>{titles[screen]}</Text>
      <View style={styles.panel}>
        {screen === "profile-personal" ? (
          <>
            <SecurityRow label="Full name" value={user.full_name} />
            <SecurityRow label="Phone" value={user.phone} />
            <SecurityRow label="Email" value={user.email} />
          </>
        ) : screen === "profile-notifications" ? (
          <>
            <SecurityToggle label="Security alerts" value onChange={() => {}} />
            <SecurityToggle
              label="Transaction updates"
              value
              onChange={() => {}}
            />
            <SecurityToggle
              label="Product updates"
              value={false}
              onChange={() => {}}
            />
          </>
        ) : screen === "profile-appearance" ? (
          <>
            <Text style={styles.muted}>
              Choose the display style for the security center.
            </Text>
            <View style={styles.actionGrid}>
              <View style={styles.action}>
                <Text style={styles.actionIcon}>*</Text>
                <Text style={styles.cardTitle}>Dark</Text>
                <Text style={styles.mutedSmall}>Security focused</Text>
              </View>
              <View style={styles.action}>
                <Text style={styles.actionIcon}>O</Text>
                <Text style={styles.cardTitle}>Light</Text>
                <Text style={styles.mutedSmall}>Bright and clear</Text>
              </View>
            </View>
          </>
        ) : screen === "profile-help" ? (
          <>
            <Text style={styles.cardTitle}>
              How does MoMoGuard assess risk?
            </Text>
            <Text style={styles.muted}>
              AI compares amount, recipient, time, location, and device signals.
              It provides a recommendation, not a final fraud verdict.
            </Text>
            <Text style={styles.cardTitle}>
              What should I do if I suspect fraud?
            </Text>
            <Text style={styles.muted}>
              Pause the transaction, do not share your PIN, and report the
              activity for review.
            </Text>
            <Button secondary onPress={() => {}}>
              Contact support
            </Button>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Your data, your control</Text>
            <Text style={styles.muted}>
              MoMoGuard uses account, device, and transaction details to provide
              fraud monitoring. We never ask for or store your mobile-money PIN.
            </Text>
            <Text style={styles.cardTitle}>Using MoMoGuard responsibly</Text>
            <Text style={styles.muted}>
              Risk results are recommendations. Verify suspicious activity and
              follow your mobile-money provider's official guidance.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [screen, setScreen] = useState("home");
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    AsyncStorage.multiGet(["momoguard_token", "momoguard_user"]).then(
      ([tokenEntry, userEntry]) => {
        if (tokenEntry[1] && userEntry[1]) {
          setToken(tokenEntry[1]);
          setUser(JSON.parse(userEntry[1]));
        }
      },
    );
  }, []);
  function navigate(nextScreen, item) {
    setSelected(item || null);
    setScreen(nextScreen);
  }
  async function signOut() {
    await AsyncStorage.multiRemove(["momoguard_token", "momoguard_user"]);
    setToken(null);
    setUser(null);
    setScreen("home");
  }
  if (!user || !token)
    return (
      <AuthScreen
        onAuthenticated={(nextUser, nextToken) => {
          setUser(nextUser);
          setToken(nextToken);
        }}
      />
    );
  const content =
    screen === "home" ? (
      <Home user={user} navigate={navigate} />
    ) : screen === "transactions" ? (
      <Transactions token={token} navigate={navigate} />
    ) : screen === "security" ? (
      <Security token={token} navigate={navigate} />
    ) : screen === "alerts" ? (
      <Alerts token={token} navigate={navigate} />
    ) : screen === "profile" ? (
      <Profile user={user} navigate={navigate} onSignOut={signOut} />
    ) : screen === "transaction" ? (
      <Detail transaction={selected} token={token} navigate={navigate} />
    ) : screen === "alert" ? (
      <Detail alert={selected} token={token} navigate={navigate} />
    ) : screen.startsWith("profile-") ? (
      <ProfilePage
        screen={screen}
        user={user}
        token={token}
        navigate={navigate}
      />
    ) : screen === "analysis" ? (
      <Analysis token={token} transaction={selected} navigate={navigate} />
    ) : (
      <Assistant token={token} navigate={navigate} />
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.app} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.brandText}>MoMoGuard</Text>
          <Text style={styles.headerIcon}>*</Text>
        </View>
        <View style={styles.flex}>{content}</View>
        <View style={styles.nav}>
          {[
            ["home", "Home"],
            ["transactions", "Activity"],
            ["security", "Security"],
            ["alerts", "Alerts"],
            ["profile", "Profile"],
          ].map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => navigate(id)}
              style={styles.navItem}
            >
              <Text style={screen === id ? styles.link : styles.muted}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Devices({ token, navigate }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api("/devices", {}, token).then((result) => setItems(result.items));
  }, [token]);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Back onPress={() => navigate("security")} title="Security" />
      <Text style={styles.title}>Trusted devices</Text>
      {items.map((device) => (
        <View key={device.id} style={styles.panel}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardTitle}>{device.name}</Text>
              <Text style={styles.mutedSmall}>
                {device.location} - {device.last_active}
              </Text>
            </View>
            <Text style={device.trusted ? styles.safe : styles.warning}>
              {device.trusted ? "Trusted" : "Review"}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
function Analysis({ token, transaction, navigate }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    api("/fraud/predict", {
      method: "POST",
      body: JSON.stringify({
        amount: Math.abs(transaction?.amount || 2500),
        new_recipient: transaction?.status === "REVIEW",
        unusual_time: transaction?.status === "REVIEW",
        new_device: transaction?.status === "REVIEW",
      }),
    }).then(setResult);
  }, [transaction]);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Back
        onPress={() =>
          navigate(transaction ? "transaction" : "home", transaction)
        }
        title={transaction ? "Transaction" : "Home"}
      />
      <Text style={styles.title}>AI analysis</Text>
      <View style={styles.securityScore}>
        <View style={styles.gauge}>
          <Text style={styles.gaugeText}>{result?.risk_score ?? "--"}</Text>
        </View>
        <View>
          <Text style={styles.eyebrow}>
            {result?.risk_level || "ANALYZING"}
          </Text>
          <Text style={styles.cardTitle}>
            {result?.decision || "Checking signals..."}
          </Text>
        </View>
      </View>
      {result?.reasons?.map((reason) => (
        <View key={reason.title} style={styles.panel}>
          <Text style={styles.warning}>!</Text>
          <Text style={styles.cardTitle}>{reason.title}</Text>
          <Text style={styles.mutedSmall}>{reason.detail}</Text>
        </View>
      ))}
      {result ? (
        <Text style={styles.muted}>{result.recommendation}</Text>
      ) : (
        <ActivityIndicator color={COLORS.cyan} />
      )}
    </ScrollView>
  );
}
function Assistant({ token, navigate }) {
  const [response, setResponse] = useState("");
  async function ask(message) {
    const result = await api(
      "/ai/chat",
      { method: "POST", body: JSON.stringify({ message }) },
      token,
    );
    setResponse(result.message);
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ALWAYS HERE TO HELP</Text>
      <Text style={styles.title}>MoMoGuard AI</Text>
      <View style={styles.panel}>
        <Text style={styles.cardTitle}>
          Your personal fraud security assistant
        </Text>
        <Text style={styles.muted}>
          Ask about suspicious transactions, scam messages, or keeping your
          account safe.
        </Text>
        {[
          "Is this transaction suspicious?",
          "How do I avoid MoMo scams?",
          "What if someone asks for my PIN?",
        ].map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => ask(prompt)}
            style={styles.prompt}
          >
            <Text style={styles.link}>{prompt}</Text>
          </Pressable>
        ))}
        {response ? <Text style={styles.aiResponse}>* {response}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  authScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    padding: 20,
  },
  authCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  brandMark: {
    backgroundColor: COLORS.cyan,
    color: COLORS.bg,
    borderRadius: 10,
    padding: 8,
    fontWeight: "800",
  },
  brandText: { color: COLORS.ink, fontSize: 20, fontWeight: "800" },
  eyebrow: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 6,
  },
  sectionHeading: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 10,
  },
  muted: { color: COLORS.muted, lineHeight: 20 },
  mutedSmall: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  error: {
    color: COLORS.red,
    backgroundColor: "rgba(244,123,131,.1)",
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  field: { marginTop: 14 },
  fieldLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#0b1c27",
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 13,
  },
  button: {
    backgroundColor: COLORS.cyan,
    padding: 14,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 16,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  buttonSecondary: {
    backgroundColor: COLORS.panel2,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  buttonText: { color: COLORS.bg, fontWeight: "800" },
  buttonSecondaryText: { color: COLORS.ink },
  disabled: { opacity: 0.55 },
  switchText: {
    color: COLORS.cyan,
    textAlign: "center",
    marginTop: 18,
    fontWeight: "700",
  },
  demoCode: {
    color: COLORS.amber,
    backgroundColor: "rgba(239,189,104,0.12)",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    fontWeight: "700",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerIcon: { color: COLORS.cyan, fontSize: 22 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(121,215,161,.09)",
    borderColor: "rgba(121,215,161,.24)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginTop: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },
  balance: {
    backgroundColor: COLORS.panel2,
    borderRadius: 22,
    padding: 20,
    marginTop: 14,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  live: { color: COLORS.cyan, fontWeight: "800" },
  balanceValue: {
    color: COLORS.ink,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 5,
  },
  moneyRow: {
    flexDirection: "row",
    gap: 30,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    marginTop: 18,
    paddingTop: 16,
  },
  income: { color: COLORS.green, fontWeight: "800", marginTop: 4 },
  warning: { color: COLORS.amber, fontWeight: "800" },
  safe: { color: COLORS.green, fontWeight: "800" },
  critical: { color: COLORS.red, fontWeight: "800" },
  sectionTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 12,
  },
  sectionHeading: { color: COLORS.ink, fontSize: 19, fontWeight: "800" },
  link: { color: COLORS.cyan, fontWeight: "700" },
  riskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: COLORS.panel2,
    borderRadius: 20,
    padding: 18,
  },
  gauge: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 7,
    borderColor: COLORS.cyan,
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeText: { color: COLORS.ink, fontSize: 20, fontWeight: "800" },
  cardTitle: { color: COLORS.ink, fontWeight: "700" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    width: "48%",
    minHeight: 106,
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  actionIcon: { color: COLORS.cyan, fontSize: 20, marginBottom: 10 },
  filters: { flexDirection: "row", gap: 8, marginVertical: 16 },
  filter: {
    backgroundColor: COLORS.panel,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  filterActive: {
    backgroundColor: "rgba(80,213,208,.1)",
    borderColor: COLORS.cyan,
  },
  panel: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    marginBottom: 12,
  },
  criticalPanel: { borderLeftWidth: 3, borderLeftColor: COLORS.red },
  empty: { alignItems: "center", padding: 30 },
  securityScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: COLORS.panel2,
    borderRadius: 20,
    padding: 20,
    marginVertical: 16,
  },
  setting: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingVertical: 14,
    marginTop: 10,
  },
  profile: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginVertical: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.cyan,
    color: COLORS.bg,
    textAlign: "center",
    paddingTop: 17,
    fontWeight: "800",
  },
  menu: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingVertical: 17,
  },
  menuIcon: { color: COLORS.cyan, fontSize: 20 },
  prompt: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    marginTop: 10,
  },
  aiResponse: {
    color: COLORS.ink,
    backgroundColor: "rgba(80,213,208,.1)",
    padding: 13,
    borderRadius: 12,
    marginTop: 12,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingVertical: 14,
    backgroundColor: COLORS.panel,
  },
  navItem: { paddingHorizontal: 5 },
  backLink: { marginBottom: 12 },
  transactionActions: { marginTop: 0 },
  riskSummary: { marginTop: 14 },
  settingsList: { marginTop: 12 },
  analysis: { marginTop: 14 },
  analysisRow: { flexDirection: "row", justifyContent: "space-between" },
  device: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
});
