import { define } from "../utils.ts";
import {
  extractEmailsFromWebsite,
} from "../lib/email-extractor.ts";
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

function cleanEmails(
  emails: string[],
): string[] {
  return [
    ...new Set(
      emails.filter(
        (email) =>
          typeof email === "string" &&
          email.includes("@") &&
          !email.includes("/") &&
          !email.includes("\\") &&
          !email.includes("://"),
      ),
    ),
  ];
}

export const handler =
  define.handlers({
    async GET(req) {
      const url =
        new URL(req.url);

      const city =
        url.searchParams
          .get("city")
          ?.trim();

      const state =
        url.searchParams
          .get("state")
          ?.trim() ?? "";

      const query =
        url.searchParams
          .get("q")
          ?.trim() ||
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

      const apiKey =
        Deno.env.get(
          "SERPAPI_KEY",
        );

      if (!apiKey) {
        return Response.json(
          {
            error:
              "SERPAPI_KEY is not configured",
          },
          { status: 500 },
        );
      }

      const searchQuery =
        `${query} in ${city}${
          state ? `, ${state}` : ""
        }`;

      const serpUrl =
        new URL(
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

      const response =
        await fetch(serpUrl);

      if (!response.ok) {
        const errorBody =
          await response.text();

        return Response.json(
          {
            error:
              "SerpApi request failed",
            status:
              response.status,
            details:
              errorBody,
          },
          { status: 502 },
        );
      }

      const data =
        (await response.json()) as
          SerpApiResult;

      if (data.error) {
        return Response.json(
          {
            error: data.error,
          },
          { status: 502 },
        );
      }

      const results =
        data.local_results ?? [];

      const leads: Lead[] = [];

      let newLeads = 0;
      let existingLeads = 0;
      let reEnriched = 0;

      for (
        const result of results
      ) {
        if (!result.place_id) {
          continue;
        }

        const existing =
          await getLead(
            result.place_id,
          );

        /*
         * Clean emails already stored
         * in KV.
         *
         * This removes garbage from
         * previous versions of the
         * extractor.
         */
        const existingEmails =
          cleanEmails(
            existing?.emails ?? [],
          );

        /*
         * If an existing lead already has
         * an email, save the cleaned version
         * and don't crawl again.
         */
        if (
          existing &&
          existingEmails.length > 0
        ) {
          const cleanedLead: Lead = {
            ...existing,
            emails:
              existingEmails,
            updatedAt:
              existing.updatedAt,
          };

          /*
           * Only write if something was
           * actually removed.
           */
          if (
            existingEmails.length !==
            existing.emails.length
          ) {
            await saveLead(
              cleanedLead,
            );
          }

          leads.push(
            cleanedLead,
          );

          existingLeads++;

          continue;
        }

        /*
         * New lead OR existing lead with
         * no usable email.
         */
        let emails: string[] = [];

        if (result.website) {
          emails =
            await extractEmailsFromWebsite(
              result.website,
            );
        }

        emails =
          cleanEmails(emails);

        const now =
          new Date().toISOString();

        const lead: Lead = {
          placeId:
            result.place_id,

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

          source:
            "google_maps",

          enriched: true,

          createdAt:
            existing?.createdAt ??
            now,

          updatedAt:
            now,
        };

        await saveLead(
          lead,
        );

        leads.push(lead);

        if (existing) {
          reEnriched++;
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

        found:
          leads.length,

        withEmail:
          leads.filter(
            (lead) =>
              lead.emails.length >
              0,
          ).length,

        newLeads,

        existingLeads,

        reEnriched,

        leads,
      });
    },
  });
