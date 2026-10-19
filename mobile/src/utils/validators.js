/**
 * Shared validation utilities for MoMoGuard
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Ghanaian mobile money numbers: 02X, 05X, +2332X, +2335X (MTN, Telecel, AT)
export const GH_PHONE_REGEX = /^(\+233|0)[235][0-9]{8}$/;

/**
 * Validates an email address
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Normalizes phone number by removing spaces, dashes, and parentheses
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/[\s\-()]/g, "");
}

/**
 * Validates a Ghanaian mobile money phone number
 */
export function isValidGhanaPhone(phone) {
  const clean = normalizePhone(phone);
  return GH_PHONE_REGEX.test(clean);
}
