/**
 * Shared formatting utilities for MoMoGuard
 */

/**
 * Safely parse amount into a valid number, defaulting to 0
 */
export function sanitizeAmount(amount) {
  if (amount === null || amount === undefined || amount === "") return 0;
  const num = Number(amount);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Format amount as currency (e.g. "GHS 120.00")
 */
export function formatCurrency(amount, currency = "GHS") {
  const sanitized = sanitizeAmount(amount);
  const absVal = Math.abs(sanitized).toFixed(2);
  return `${currency} ${absVal}`;
}

/**
 * Format absolute amount as fixed 2 decimal string (e.g. "120.00")
 */
export function formatAmount(amount) {
  const sanitized = sanitizeAmount(amount);
  return Math.abs(sanitized).toFixed(2);
}

/**
 * Format amount with positive/negative sign (e.g. "+ GHS 50.00" or "- GHS 20.00")
 */
export function formatSignedCurrency(amount, currency = "GHS") {
  const sanitized = sanitizeAmount(amount);
  const sign = sanitized >= 0 ? "+" : "-";
  const absVal = Math.abs(sanitized).toFixed(2);
  return `${sign} ${currency} ${absVal}`;
}

/**
 * Safe date-time formatter (e.g. "12 Oct 2026, 14:30")
 */
export function formatDateTime(dateString, fallback = "Recent transaction") {
  if (!dateString) return fallback;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return fallback;
  }
}

/**
 * Safe date formatter (e.g. "12 Oct 2026")
 */
export function formatDate(dateString, fallback = "Recent") {
  if (!dateString) return fallback;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString("en-GB", { dateStyle: "medium" });
  } catch {
    return fallback;
  }
}

/**
 * Extracts first name from full name
 */
export function getFirstName(fullName, fallback = "Member") {
  if (!fullName || typeof fullName !== "string") return fallback;
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fallback;
}
