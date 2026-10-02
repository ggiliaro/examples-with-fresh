const EMAIL_REGEX =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

const MAX_CONTACT_PAGES = 3;

const BLOCKED_EMAILS = new Set([
  "user@domain.com",
  "you@email.com",
  "info@mysite.com",
  "example@mysite.com",
  "test@example.com",
]);

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "mysite.com",
  "domain.com",
  "localhost",
  "sentry.io",
  "wixpress.com",
  "sentry-next.wixpress.com",
]);

function normalizeEmail(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim()
    .toLowerCase();
}

export function isValidBusinessEmail(
  value: string,
): boolean {
  const email = normalizeEmail(value);

  if (!email) return false;

  if (email.length > 254) return false;

  if (BLOCKED_EMAILS.has(email)) {
    return false;
  }

  const atCount =
    (email.match(/@/g) ?? []).length;

  if (atCount !== 1) {
    return false;
  }

  if (
    email.includes("/") ||
    email.includes("\\") ||
    email.includes("://")
  ) {
    return false;
  }

  if (!EMAIL_REGEX.test(email)) {
    EMAIL_REGEX.lastIndex = 0;
    return false;
  }

  EMAIL_REGEX.lastIndex = 0;

  const atIndex = email.lastIndexOf("@");

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!local || !domain) {
    return false;
  }

  if (local.length > 64) {
    return false;
  }

  if (domain.length > 253) {
    return false;
  }

  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return false;
  }

  if (
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return false;
  }

  if (
    domain.includes("/") ||
    domain.includes("\\") ||
    domain.includes(":")
  ) {
    return false;
  }

  if (BLOCKED_DOMAINS.has(domain)) {
    return false;
  }

  const labels = domain.split(".");

  if (labels.length < 2) {
    return false;
  }

  for (const label of labels) {
    if (!label) return false;

    if (label.length > 63) {
      return false;
    }

    if (
      label.startsWith("-") ||
      label.endsWith("-")
    ) {
      return false;
    }

    if (!/^[a-z0-9-]+$/i.test(label)) {
      return false;
    }
  }

  /*
   * Reject domains such as:
   *
   * 11.7.10
   * 1.0.1
   * 29.8658183
   */
  const tld = labels[labels.length - 1];

  if (!/^[a-z]{2,63}$/i.test(tld)) {
    return false;
  }

  /*
   * Reject obvious dependency/version strings.
   */
  if (
    /\d+\.\d+\.\d+/.test(email)
  ) {
    return false;
  }

  /*
   * These are common package/library patterns
   * rather than business email addresses.
   */
  if (
    local.includes("/") ||
    local.includes("\\") ||
    local.includes("package") ||
    local.includes("bundler=")
  ) {
    return false;
  }

  return true;
}

function stripNonVisibleHtml(
  html: string,
): string {
  return html
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(
      /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
      " ",
    )
    .replace(
      /<template\b[^>]*>[\s\S]*?<\/template>/gi,
      " ",
    )
    .replace(
      /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
      " ",
    )
    .replace(
      /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
      " ",
    )
    .replace(
      /<head\b[^>]*>[\s\S]*?<\/head>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function extractVisibleEmails(
  html: string,
): string[] {
  const visibleText =
    stripNonVisibleHtml(html);

  const matches =
    visibleText.match(EMAIL_REGEX) ?? [];

  return [
    ...new Set(
      matches
        .map(normalizeEmail)
        .filter(isValidBusinessEmail),
    ),
  ];
}

function extractMailtoEmails(
  html: string,
): string[] {
  const emails: string[] = [];

  const regex =
    /href\s*=\s*["']mailto:([^"'?#\s>]+)/gi;

  for (const match of html.matchAll(regex)) {
    const email = normalizeEmail(
      match[1] ?? "",
    );

    if (isValidBusinessEmail(email)) {
      emails.push(email);
    }
  }

  return [...new Set(emails)];
}

function extractUsefulLinks(
  html: string,
  baseUrl: string,
): string[] {
  const links: string[] = [];

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let base: URL;

  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  for (const match of html.matchAll(regex)) {
    const href = match[1];

    if (!href) continue;

    const lower = href.toLowerCase();

    if (
      !lower.includes("contact") &&
      !lower.includes("about")
    ) {
      continue;
    }

    try {
      const url = new URL(
        href,
        base.href,
      );

      if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
      ) {
        continue;
      }

      /*
       * Only crawl pages belonging to the
       * same website.
       */
      if (
        url.hostname !== base.hostname
      ) {
        continue;
      }

      links.push(url.href);
    } catch {
      // Ignore malformed URLs.
    }
  }

  return [
    ...new Set(links),
  ].slice(0, MAX_CONTACT_PAGES);
}

async function fetchPage(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HVACLeadFinder/1.0)",
        "Accept":
          "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return null;
    }

    const contentType =
      response.headers.get(
        "content-type",
      ) ?? "";

    if (
      !contentType.includes("text/html")
    ) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

export async function extractEmailsFromWebsite(
  website: string,
): Promise<string[]> {
  let homepage: URL;

  try {
    homepage = new URL(website);

    if (
      homepage.protocol !== "http:" &&
      homepage.protocol !== "https:"
    ) {
      return [];
    }
  } catch {
    return [];
  }

  const emails = new Set<string>();

  /*
   * Crawl homepage.
   */
  const homepageHtml =
    await fetchPage(homepage.href);

  if (!homepageHtml) {
    return [];
  }

  /*
   * mailto: links are highly reliable.
   */
  for (
    const email of extractMailtoEmails(
      homepageHtml,
    )
  ) {
    emails.add(email);
  }

  /*
   * Only inspect visible text.
   * JavaScript/package metadata is removed.
   */
  for (
    const email of extractVisibleEmails(
      homepageHtml,
    )
  ) {
    emails.add(email);
  }

  /*
   * If the homepage doesn't give us an
   * email, inspect contact/about pages.
   */
  if (emails.size === 0) {
    const links =
      extractUsefulLinks(
        homepageHtml,
        homepage.href,
      );

    for (const link of links) {
      const html =
        await fetchPage(link);

      if (!html) continue;

      for (
        const email of extractMailtoEmails(
          html,
        )
      ) {
        emails.add(email);
      }

      for (
        const email of extractVisibleEmails(
          html,
        )
      ) {
        emails.add(email);
      }

      if (emails.size >= 5) {
        break;
      }
    }
  }

  return [...emails];
}
