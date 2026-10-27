import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { jsonOk, route } from "@/lib/http";
import { leadPayload } from "@/lib/pipeline/payloads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

/** GET /api/v1/leads?status=new,review&search=acme&limit=50&offset=0 (admin or n8n). */
export const GET = route(async (request) => {
  await authorize(request, ["admin", "n8n"]);
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "")
    .split(",")
    .filter((value): value is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(value));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const page = await getRepository().listLeads({
    status: status.length ? status : undefined,
    search: url.searchParams.get("search") ?? undefined,
    limit,
    offset,
  });
  return jsonOk({ items: page.items.map(leadPayload), total: page.total, limit, offset });
});
