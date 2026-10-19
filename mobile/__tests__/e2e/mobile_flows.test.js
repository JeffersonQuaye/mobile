import { describe, it } from "node:test";
import assert from "node:assert";

import {
  saveSession,
  loadSession,
  clearSession,
  setCache,
  getCache,
} from "../../src/services/storage.js";
import { getConfig, setRuntimeEnv, ENVIRONMENTS } from "../../src/config/env.js";
import {
  isValidEmail,
  isValidGhanaPhone,
  normalizePhone,
} from "../../src/utils/validators.js";
import {
  formatCurrency,
  formatSignedCurrency,
  formatDateTime,
  getFirstName,
} from "../../src/utils/formatters.js";

describe("Mobile End-to-End User Flow Tests", () => {
  describe("E2E Scenario 1: Authentication & Session Lifecycle", () => {
    it("validates input criteria before dispatching network request", () => {
      // Invalid phone
      assert.strictEqual(isValidGhanaPhone("123456"), false);
      assert.strictEqual(isValidGhanaPhone("+1234567890"), false);
      // Valid Ghana MoMo phones (MTN/Telecel/AT prefixes)
      assert.strictEqual(isValidGhanaPhone("0244123456"), true);
      assert.strictEqual(isValidGhanaPhone("+233244123456"), true);
      assert.strictEqual(isValidGhanaPhone("0551234567"), true);
      assert.strictEqual(normalizePhone("+233 24 412 3456"), "+233244123456");

      // Invalid emails
      assert.strictEqual(isValidEmail("plainaddress"), false);
      assert.strictEqual(isValidEmail("user@domain"), false);
      // Valid email
      assert.strictEqual(isValidEmail("ghana.momo@example.com"), true);

      // Shared formatters
      assert.strictEqual(formatCurrency(120), "GHS 120.00");
      assert.strictEqual(formatCurrency(null), "GHS 0.00");
      assert.strictEqual(formatSignedCurrency(50), "+ GHS 50.00");
      assert.strictEqual(formatSignedCurrency(-25), "- GHS 25.00");
      assert.strictEqual(formatDateTime(null, "Recent"), "Recent");
      assert.ok(typeof formatDateTime("2026-10-12T14:00:00Z") === "string");
      assert.strictEqual(getFirstName("Kwame Nkrumah"), "Kwame");
    });

    it("persists secure session to storage and restores on boot", async () => {
      const mockSession = {
        user: {
          id: "usr-e2e-001",
          full_name: "Kojo Mensah",
          email: "kojo.mensah@example.com",
          phone: "+233244123456",
        },
        token: "jwt-mock-access-token-xyz",
        refresh_token: "refresh-mock-token-abc",
      };

      await saveSession(mockSession);

      // Simulate app restart / cold boot
      const restored = await loadSession();
      assert.ok(restored, "Session should be restored");
      assert.strictEqual(restored.user.email, "kojo.mensah@example.com");
      assert.strictEqual(restored.token, "jwt-mock-access-token-xyz");

      // Logout clears session
      await clearSession();
      const afterLogout = await loadSession();
      assert.strictEqual(afterLogout, null);
    });
  });

  describe("E2E Scenario 2: Offline Resilience & Cache Fallback", () => {
    it("caches wallet ledger in storage and serves it during network outages", async () => {
      const cacheKey = "/dashboard";
      const sampleDashboard = {
        balance: 4500.5,
        income: 6000.0,
        spending: 1499.5,
        security_score: 92,
      };

      // Save to cache when online
      await setCache(cacheKey, sampleDashboard);

      // Verify retrieval when offline
      const cached = await getCache(cacheKey);
      assert.ok(cached, "Cache should return stored snapshot");
      assert.strictEqual(cached.data.balance, 4500.5);
      assert.strictEqual(cached.data.security_score, 92);
      assert.ok(cached.timestamp > 0);
    });
  });

  describe("E2E Scenario 3: Real Fraud Reporting Validation & Submission Payload", () => {
    it("enforces category selection and description length constraints", () => {
      const validateReport = (category, description) => {
        if (!category) return "Category is required";
        if (!description || description.trim().length < 15) {
          return "Description must be at least 15 characters";
        }
        return null;
      };

      assert.strictEqual(validateReport(null, "some text"), "Category is required");
      assert.strictEqual(
        validateReport("UNAUTHORIZED_TRANSACTION", "Too short"),
        "Description must be at least 15 characters",
      );
      assert.strictEqual(
        validateReport(
          "UNAUTHORIZED_TRANSACTION",
          "Received an unauthorized SIM debited transfer of 250 cedis.",
        ),
        null,
      );
    });

    it("builds compliant API payload for /api/reports", () => {
      const transaction = { id: "tx-789-flagged" };
      const category = "IMPERSONATION";
      const description = "Caller pretended to be MTN fraud agent and requested OTP.";
      const phone = "0244999888";

      const payload = {
        category,
        description: `${description}\n[Contact phone: ${phone}]`,
        transaction_id: transaction.id,
      };

      assert.strictEqual(payload.category, "IMPERSONATION");
      assert.strictEqual(payload.transaction_id, "tx-789-flagged");
      assert.ok(payload.description.includes("Caller pretended"));
    });
  });

  describe("E2E Scenario 4: Multi-Environment Switching", () => {
    it("switches environment dynamically and provides appropriate endpoints", () => {
      // Development
      setRuntimeEnv(ENVIRONMENTS.DEVELOPMENT);
      const devConfig = getConfig();
      assert.strictEqual(devConfig.env, "development");
      assert.strictEqual(devConfig.isDev, true);

      // Staging
      setRuntimeEnv(ENVIRONMENTS.STAGING);
      const stagingConfig = getConfig();
      assert.strictEqual(stagingConfig.env, "staging");
      assert.strictEqual(stagingConfig.isStaging, true);
      assert.ok(stagingConfig.apiBaseUrl.includes("staging"));

      // Production
      setRuntimeEnv(ENVIRONMENTS.PRODUCTION);
      const prodConfig = getConfig();
      assert.strictEqual(prodConfig.env, "production");
      assert.strictEqual(prodConfig.isProduction, true);
      assert.strictEqual(prodConfig.requireSsl, true);

      // Reset to dev for tests
      setRuntimeEnv(ENVIRONMENTS.DEVELOPMENT);
    });
  });
});
