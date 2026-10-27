import { authorize } from "@/lib/auth/guard";
import { getConfig } from "@/lib/env";
import { ApiError, jsonOk, route } from "@/lib/http";
import { seedDemoData } from "@/lib/demo";

/** POST /api/v1/admin/demo-seed — load sample leads (local store or development only). */
export const POST = route(async (request) => {
  await authorize(request, ["admin"]);
  const config = getConfig();
  if (config.isProduction && config.dataStore !== "local") {
    throw new ApiError(403, "forbidden", "Demo data can only be loaded into the local store or in development");
  }
  const created = await seedDemoData();
  return jsonOk({ created }, { status: 201 });
});
