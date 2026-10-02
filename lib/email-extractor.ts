const EMAIL_REGEX =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

const PAGE_LIMIT = 3;

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) ?? [];

  return [...new Set(
    matches
      .map((email) => email.toLowerCase())
      .filter((email) =>
        !email.endsWith(".png") &&
        !email.endsWith(".jpg") &&
        !email.includes("example.com") &&
        !email.includes("sentry.io")
      ),
  )];
}

function extractUsefulLinks(
  html: string,
  baseUrl: string,
): string[] {
  const links: string[] = [];

  const regex = /href=["']([^"']+)["']/gi;

  for (const match of html.matchAll(regex)) {
    const href = match[1];

    if (!href) continue;

    const lower = href.toLowerCase();

    if (
      lower.includes("contact") ||
      lower.includes("about")
    ) {
      try {
        const url = new URL(href, baseUrl);

        if (url.protocol === "http:" || url.protocol === "https:") {
          links.push(url.href);
        }
      } catch {
        // Ignore malformed URLs.
      }
    }
  }

  return [...new Set(links)].slice(0, PAGE_LIMIT);
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; HVACLeadFinder/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
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
  } catch {
    return [];
  }

  const emails = new Set<string>();

  const homepageHtml = await fetchPage(homepage.href);

  if (!homepageHtml) {
    return [];
  }

  for (const email of extractEmails(homepageHtml)) {
    emails.add(email);
  }

  if (emails.size > 0) {
    return [...emails];
  }

  const links = extractUsefulLinks(
    homepageHtml,
    homepage.href,
  );

  for (const link of links) {
    const html = await fetchPage(link);

    if (!html) continue;

    for (const email of extractEmails(html)) {
      emails.add(email);
    }

    if (emails.size >= 5) {
      break;
    }
  }

  return [...emails];
}
