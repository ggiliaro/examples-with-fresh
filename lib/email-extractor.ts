const EMAIL_REGEX =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

const MAX_CONTACT_PAGES = 3;

const BLOCKED_EMAILS = new Set([
  "user@domain.com",
  "info@mysite.com",
  "example@mysite.com",
]);

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "mysite.com",
  "domain.com",
  "sentry.io",
  "sentry-next.wixpress.com",
]);

function isValidEmail(email: string): boolean {
  const value = email.trim().toLowerCase();

  if (value.length > 254) return false;

  if (BLOCKED_EMAILS.has(value)) return false;

  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return false;
  }

  const atIndex = value.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === value.length - 1) {
    return false;
  }

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (!local || !domain) return false;

  if (local.length > 64 || domain.length > 253) {
    return false;
  }

  if (local.includes("/") || local.includes("\\")) {
    return false;
  }

  if (domain.includes("/") || domain.includes("\\")) {
    return false;
  }

  if (BLOCKED_DOMAINS.has(domain)) {
    return false;
  }

  if (!domain.includes(".")) {
    return false;
  }

  if (domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  if (domain.includes("..")) {
    return false;
  }

  // Reject things such as foo
