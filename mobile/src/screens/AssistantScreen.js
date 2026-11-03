/**
 * MoMoGuard AI Security Assistant Screen
 * ----------------------------------------
 * Provides a conversational chat interface backed by the backend AI assistant API.
 *
 * Features:
 * 1. Chat Conversation: Renders a scrollable history of user and AI messages in
 *    distinct styled chat bubbles (right-aligned for user, left for AI).
 * 2. Recommended Actions: When the AI response includes action items, they are
 *    rendered below the AI's reply as a structured bullet list.
 * 3. Suggested Prompts: Pre-defined quick-tap question chips help users start
 *    common fraud-related queries without typing.
 * 4. Deep-link Support: Accepts an `initialQuery` route param so other screens
 *    (e.g. AlertsScreen) can open the assistant pre-populated with a question.
 * 5. Keyboard Avoidance: Wraps the layout in KeyboardAvoidingView so the chat
 *    input stays visible when the on-screen keyboard is raised (iOS only).
 */

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
import { Button, Card, FormError, Header, Screen } from "../components/UI";

// Pre-defined fraud-related quick questions shown as tappable chips
// so users can start common queries without typing.
const SUGGESTED_PROMPTS = [
  "How do I recognize a fake MoMo agent call?",
  "What should I do if money was sent to the wrong number?",
  "Can an agent ever legally ask for my 4-digit PIN?",
  "How does SIM-swap fraud happen in Ghana?",
];

export default function AssistantScreen({ route }) {
  // Retrieve the JWT token from auth context for API calls
  const { token } = useAuth();
  // Optional deep-link param: pre-populates the assistant with a query
  const initialQuery = route.params?.initialQuery || "";

  // Current text in the chat input field
  const [inputMessage, setInputMessage] = useState(initialQuery);
  // Full conversation history; starts with the AI greeting message
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I am your MoMoGuard AI Security Assistant. Ask me anything about mobile-money fraud prevention, suspicious messages, or wallet security in Ghana.",
    },
  ]);
  // True while awaiting an API response — disables inputs to prevent double-submit
  const [busy, setBusy] = useState(false);
  // Inline error message displayed above the input when the API call fails
  const [error, setError] = useState("");

  // If the screen was opened with a pre-filled query (e.g. from AlertsScreen),
  // automatically send it once the component mounts.
  useEffect(() => {
    if (initialQuery) {
      sendMessage(initialQuery);
    }
  }, [initialQuery]);

  /**
   * Sends a message to the AI assistant API and appends both the user's
   * message and the AI's response to the conversation history.
   *
   * @param {string} [textToSend] - Overrides the input field value (used by
   *   suggested prompt chips and the deep-link initial query).
   */
  async function sendMessage(textToSend) {
    // Accept either an explicit argument or whatever is in the text input
    const text = (textToSend || inputMessage).trim();
    if (!text) return; // Do nothing on empty sends

    setError("");  // Clear any previous API error
    setBusy(true); // Lock the UI during the network call

    // Optimistically append the user message before awaiting the API
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputMessage(""); // Clear the text field immediately

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
                      style={[styles.label, { color: colors.accent, marginBottom: 4 }]}
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
              <Text
                style={{ color: colors.accentLight, fontSize: 13, fontWeight: "600" }}
              >
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
