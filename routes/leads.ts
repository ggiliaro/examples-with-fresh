import { define } from "../utils.ts";
import { getLeads } from "../lib/kv.ts";

export const handler = define.handlers({
  async GET() {
    const leads = await getLeads(500);

    return Response.json({
      success: true,
      count: leads.length,
      leads,
    });
  },
});
