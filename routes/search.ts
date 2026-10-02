import { define } from "../utils.ts";
import { extractEmailsFromWebsite } from "../lib/email-extractor.ts";
import {
  getLead,
  saveLead,
  type Lead,
} from "../lib/kv.ts";

interface SerpApiResult {
  local_results?: Array<{
    place_id?: string;
    title?: string;
    type?: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviews?: number;
    thumbnail?: string;
    gps_coordinates?: {
      latitude?: number;
      longitude?: number;
    };
  }>;

  error?: string;
}

function hasUsableEmails(emails: string[]): boolean {
  return emails.length > 0;
}

export const handler = define.handlers({
  async GET(req) {
    const url = new URL(req.url);

    const city = url.searchParams.get("city")?.trim();
    const state = url.searchParams.get("state")?.trim() ?? "";
    const query =
      url.searchParams.get("q")?.trim() ||
      "HVAC contractors";

    if (!city) {
      return Response.json(
        {
          error: "Missing city",
          example:
            "/search?city=Houston&state=TX",
        },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get("SERPAPI_KEY");

    if (!apiKey) {
      return Response.json(
        {
          error: "SERPAPI_KEY is not configured",
        },
        { status: 500 },
      );
    }

    const searchQuery =
      `${query} in ${city}${state ? `, ${state}` : ""}`;

    const serpUrl = new URL(
      "https://serpapi.com/search.json",
    );

    serpUrl.searchParams.set(
      "engine",
      "google_maps",
    );

    serpUrl.searchParams.set(
      "type",
      "search",
    );

    serpUrl.searchParams.set(
      "q",
      searchQuery,
    );

    serpUrl.searchParams.set(
      "api_key",
      apiKey,
    );

    const response = await fetch(serpUrl);

    if (!response.ok) {
      const errorBody = await response.text();

      return Response.json(
        {
          error: "SerpApi request failed",
          status: response.status,
          details: errorBody,
        },
        { status: 502 },
      );
    }

    const data =
      (await response.json()) as SerpApiResult;

    if (data.error) {
      return Response.json(
        {
          error: data.error,
        },
        { status: 502 },
      );
    }

    const results = data.local_results ?? [];

    const leads: Lead[] = [];

    let newLeads = 0;
    let existingLeads = 0;
    let enrichedLeads = 0;

    for (const result of results) {
      if (!result.place_id) {
        continue;
      }

      const existing =
        await getLead(result.place_id);

      /*
       * If the lead already has a usable email,
       * don't crawl the website again.
       */
      if (
        existing &&
        hasUsableEmails(existing.emails)
      ) {
        leads.push(existing);
        existingLeads++;
        continue;
      }

      /*
       * Either this is a new lead or an existing
       * lead that previously had no usable email.
       */
      let emails: string[] = [];

      if (result.website) {
        emails =
          await extractEmailsFromWebsite(
            result.website,
          );
      }

      const now =
        new Date().toISOString();

      const lead: Lead = {
        placeId: result.place_id,

        name:
          result.title ??
          existing?.name ??
          null,

        type:
          result.type ??
          existing?.type ??
          null,

        website:
          result.website ??
          existing?.website ??
          null,

        emails,

        phone:
          result.phone ??
          existing?.phone ??
          null,

        address:
          result.address ??
          existing?.address ??
          null,

        city,

        state:
          state ||
          existing?.state ||
          null,

        rating:
          result.rating ??
          existing?.rating ??
          null,

        reviews:
          result.reviews ??
          existing?.reviews ??
          null,

        thumbnail:
          result.thumbnail ??
          existing?.thumbnail ??
          null,

        coordinates:
          result.gps_coordinates ??
          existing?.coordinates ??
          null,

        source: "google_maps",

        enriched: true,

        createdAt:
          existing?.createdAt ??
          now,

        updatedAt: now,
      };

      await saveLead(lead);

      leads.push(lead);

      if (existing) {
        enrichedLeads++;
      } else {
        newLeads++;
      }
    }

    return Response.json({
      success: true,

      city,

      state:
        state || null,

      query,

      searchQuery,

      found: leads.length,

      withEmail:
        leads.filter(
          (lead) =>
            lead.emails.length > 0,
        ).length,

      newLeads,

      existingLeads,

      reEnriched:
        enrichedLeads,

      leads,
    });
  },
});
