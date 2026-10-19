import { describe, it } from "node:test";
import assert from "node:assert";
import React from "react";

// Provide unit test hook dispatcher for functional components evaluated as direct functions
const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
if (internals) {
  internals.H = { useState: (init) => [init, () => {}] };
}
React.useState = (init) => [init, () => {}];

import {
  Button,
  Field,
  StatusBadge,
  RiskMeter,
  OfflineBanner,
  FormError,
  Header,
} from "../../src/components/UI.js";
import { TransactionRow } from "../../src/components/TransactionRow.js";
import { colors } from "../../src/theme.js";

describe("Mobile Component Tests - UI Library", () => {
  describe("Button Component", () => {
    it("renders with correct accessibility role and label", () => {
      let pressed = false;
      const element = Button({
        children: "Sign In Securely",
        onPress: () => {
          pressed = true;
        },
      });

      assert.strictEqual(element.type.displayName || element.type.name, "Pressable");
      assert.strictEqual(element.props.accessibilityRole, "button");
      assert.strictEqual(element.props.accessibilityLabel, "Sign In Securely");
      assert.strictEqual(element.props.accessibilityState.disabled, false);

      element.props.onPress();
      assert.strictEqual(pressed, true);
    });

    it("handles disabled and loading states with accessibility indicators", () => {
      const disabledBtn = Button({ children: "Submit", disabled: true });
      assert.strictEqual(disabledBtn.props.disabled, true);
      assert.strictEqual(disabledBtn.props.accessibilityState.disabled, true);

      const loadingBtn = Button({ children: "Processing", loading: true });
      assert.strictEqual(loadingBtn.props.accessibilityState.busy, true);
      assert.strictEqual(loadingBtn.props.accessibilityState.disabled, true);
    });
  });

  describe("Field Component", () => {
    it("renders label, placeholder, and handles text entry", () => {
      const fieldElem = Field({
        label: "Ghana Phone Number",
        placeholder: "0244123456",
        value: "0244000000",
      });

      assert.strictEqual(fieldElem.props.style.marginBottom, 16);
      const textInput = fieldElem.props.children[1].props.children[0];
      assert.strictEqual(textInput.props.accessibilityLabel, "Ghana Phone Number");
      assert.strictEqual(textInput.props.value, "0244000000");
    });

    it("displays error message with accessible alert role when invalid", () => {
      const fieldWithError = Field({
        label: "Email",
        value: "invalid-email",
        error: "Please enter a valid email address.",
      });

      const errorTextElem = fieldWithError.props.children[2];
      assert.ok(errorTextElem, "Error text element should exist");
      assert.strictEqual(errorTextElem.props.accessibilityRole, "alert");
      assert.strictEqual(
        errorTextElem.props.children,
        "Please enter a valid email address.",
      );
    });
  });

  describe("StatusBadge Component", () => {
    it("maps SAFE status to green color styling", () => {
      const badge = StatusBadge({ status: "SAFE" });
      assert.strictEqual(badge.props.accessibilityLabel, "Status: SAFE");
      assert.strictEqual(badge.props.style[1].borderColor, colors.green);
      assert.strictEqual(badge.props.children.props.children, "SAFE");
    });

    it("maps REVIEW and PENDING status to amber styling", () => {
      const badge = StatusBadge({ status: "REVIEW" });
      assert.strictEqual(badge.props.style[1].borderColor, colors.amber);
      assert.strictEqual(badge.props.children.props.children, "REVIEW");
    });

    it("maps BLOCKED and CRITICAL status to red styling", () => {
      const badge = StatusBadge({ status: "BLOCKED" });
      assert.strictEqual(badge.props.style[1].borderColor, colors.red);
      assert.strictEqual(badge.props.children.props.children, "BLOCKED");
    });
  });

  describe("RiskMeter Component", () => {
    it("calculates score percentage and displays risk level accurately", () => {
      const lowRisk = RiskMeter({ score: 12, level: "LOW" });
      const scoreLabel = lowRisk.props.children[0].props.children[1];
      assert.strictEqual(scoreLabel.props.children.join(""), "12% (LOW)");

      const highRisk = RiskMeter({ score: 85, level: "HIGH" });
      const fillBar = highRisk.props.children[1].props.children;
      assert.strictEqual(fillBar.props.style[1].width, "85%");
      assert.strictEqual(fillBar.props.style[1].backgroundColor, colors.red);
    });
  });

  describe("FormError Component", () => {
    it("renders alert role with error message", () => {
      const formErr = FormError({ message: "Invalid credentials" });
      assert.strictEqual(formErr.props.accessibilityRole, "alert");
      assert.ok(formErr.props.children.props.children.includes("Invalid credentials"));
      assert.strictEqual(FormError({ message: "" }), null);
    });
  });

  describe("Header Component", () => {
    it("renders header role with eyebrow and title", () => {
      const header = Header({ eyebrow: "SECURITY", title: "MoMo Guard" });
      assert.strictEqual(header.props.accessibilityRole, "header");
      assert.strictEqual(header.props.children[0].props.children, "SECURITY");
      assert.strictEqual(header.props.children[1].props.children, "MoMo Guard");
    });
  });

  describe("OfflineBanner Component", () => {
    it("renders with alert role and informative warning text", () => {
      const banner = OfflineBanner({ message: "Network unavailable." });
      assert.strictEqual(banner.props.accessibilityRole, "alert");
      const messageElem = banner.props.children[1].props.children[1];
      assert.strictEqual(messageElem.props.children, "Network unavailable.");
    });
  });

  describe("TransactionRow Component", () => {
    it("formats income amounts with positive sign and green highlight", () => {
      const tx = {
        id: "tx-1",
        merchant: "MTN Received",
        recipient: "+233244111222",
        amount: 150.0,
        currency: "GHS",
        status: "SAFE",
      };

      const row = TransactionRow({ transaction: tx });
      assert.strictEqual(row.props.accessibilityRole, "button");
      assert.ok(row.props.accessibilityLabel.includes("received 150.00 GHS"));

      const directionIcon = row.props.children[0].props.children;
      assert.strictEqual(directionIcon.props.children, "⇣");
    });

    it("formats outgoing expenses with negative sign", () => {
      const tx = {
        id: "tx-2",
        merchant: "Vodafone Cash Transfer",
        recipient: "+233200999888",
        amount: -80.0,
        currency: "GHS",
        status: "REVIEW",
      };

      const row = TransactionRow({ transaction: tx });
      assert.ok(row.props.accessibilityLabel.includes("spent 80.00 GHS"));
      const directionIcon = row.props.children[0].props.children;
      assert.strictEqual(directionIcon.props.children, "⇡");
    });
  });
});
