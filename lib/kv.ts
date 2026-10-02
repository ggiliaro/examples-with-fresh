const kv = await Deno.openKv();

export interface Lead {
  placeId: string;
  name: string | null;
  type: string | null;
  website: string | null;
  emails: string[];
  phone: string | null;
  address: string | null;
  city: string;
  state: string | null;
  rating: number | null;
  reviews: number | null;
  thumbnail: string | null;
  coordinates: {
    latitude?: number;
    longitude?: number;
  } | null;
  source: "google_maps";
  enriched: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getLead(placeId: string) {
  const result = await kv.get<Lead>(["lead", placeId]);
  return result.value;
}

export async function saveLead(lead: Lead) {
  await kv.set(["lead", lead.placeId], lead);
}

export async function getLeads(limit = 100) {
  const leads: Lead[] = [];

  for await (const entry of kv.list<Lead>({
    prefix: ["lead"],
  })) {
    leads.push(entry.value);

    if (leads.length >= limit) {
      break;
    }
  }

  return leads;
}
