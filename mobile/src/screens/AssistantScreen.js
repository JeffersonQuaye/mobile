import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { assistantService } from "../services/api";
import { colors, styles } from "../theme";
import {
  Button,
  Card,
  FormError,
  Header,
  Screen,
} from "../components/UI";

const SUGGESTED_PROMPTS = [
  "How do I recognize a fake MoMo agent call?",
  "What should I do if money was sent to the wrong number?",
  "Can an agent ever legally ask for my 4-digit PIN?",
  "How does SIM-swap fraud happen in Ghana?",
];

export default function AssistantScreen({ route }) {
  const { token } = useAuth();
  const initialQuery = route.params?.initialQuery || "";

  const [inputMessage, setInputMessage] = useState(initialQuery);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I am your MoMoGuard AI Security Assistant. Ask me anything about mobile-money fraud prevention, suspicious messages, or wallet security in Ghana.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialQuery) {
      sendMessage(initialQuery);
    }
  }, [initialQuery]);

  async function sendMessage(textToSend) {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    setError("");
    setBusy(true);

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputMessage("");

    try {
      const response = await assistantService.chat(text, null, token);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            response.message ||
            "I could not process that request. Please try asking again.",
          recommendations: response.recommended_actions || [],
        },
      ]);
    } catch (err) {
      setError(err.message || "Failed to reach AI assistant. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.safe}
    >
      <Screen scrollable>
        <Header
          eyebrow="AI FRAUD CONSULTANT"
          title="MoMoGuard AI"
          subtitle="Real-time intelligent fraud assessment and guidance."
        />

        <FormError message={error} />

        {/* Conversation History */}
        <View style={{ gap: 12, marginBottom: 18 }}>
          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <View
                key={idx}
                accessibilityRole="text"
                accessibilityLabel={`${isUser ? "You said" : "AI Assistant replied"}: ${msg.content}`}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  backgroundColor: isUser ? colors.surfaceRaised : colors.surface,
                  borderColor: isUser ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <Text
                  style={{
                    color: isUser ? colors.accent : colors.text,
                    fontSize: 14,
                    lineHeight: 21,
                  }}
                >
                  {msg.content}
                </Text>

                {msg.recommendations?.length > 0 ? (
                  <View
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text
                      style={[
                        styles.label,
                        { color: colors.accent, marginBottom: 4 },
                      ]}
                    >
                      RECOMMENDED ACTIONS:
                    </Text>
                    {msg.recommendations.map((rec, rIdx) => (
                      <Text key={rIdx} style={styles.mutedSmall}>
                        • {rec}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Quick Suggestion Chips */}
        <Text style={styles.label}>FREQUENT QUESTIONS</Text>
        <View style={{ gap: 8, marginBottom: 16 }}>
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${prompt}`}
              disabled={busy}
              onPress={() => sendMessage(prompt)}
              style={({ pressed }) => [
                styles.panel,
                {
                  padding: 12,
                  marginBottom: 0,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={{ color: colors.accentLight, fontSize: 13, fontWeight: "600" }}>
                💬 {prompt}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Chat input box */}
        <Card style={{ marginTop: 6 }}>
          <TextInput
            accessibilityLabel="Type your security question"
            accessibilityHint="Asks MoMoGuard AI questions about mobile money scams"
            placeholder="Type your question or paste a suspicious SMS..."
            placeholderTextColor={colors.muted}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            style={[
              styles.input,
              { minHeight: 60, textAlignVertical: "top", marginBottom: 10 },
            ]}
          />

          <Button
            loading={busy}
            disabled={busy || !inputMessage.trim()}
            onPress={() => sendMessage()}
            accessibilityLabel="Send question to AI assistant"
          >
            {busy ? "Analyzing with AI..." : "Consult AI"}
          </Button>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
