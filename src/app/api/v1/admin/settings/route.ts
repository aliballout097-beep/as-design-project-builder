import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { jsonOk, readJson, route } from "@/lib/http";
import { resolveSettings } from "@/lib/settings";

/** GET /api/v1/admin/settings — current app settings, with defaults applied. */
export const GET = route(async (request) => {
  await authorize(request, ["admin"]);
  const stored = await getRepository().getAppSettings();
  return jsonOk(resolveSettings(stored));
});

const SettingsPatchSchema = z
  .object({
    autoSend: z.boolean(),
    promoPercent: z.number().min(0).max(90),
    promoLabel: z.string().trim().min(1).max(80),
  })
  .partial();

/** PATCH /api/v1/admin/settings — merge into the stored settings. */
export const PATCH = route(async (request) => {
  await authorize(request, ["admin"]);
  const patch = await readJson(request, SettingsPatchSchema, { maxBytes: 4096 });
  const repo = getRepository();
  const current = (await repo.getAppSettings()) ?? {};
  const next = { ...current, ...patch };
  await repo.saveAppSettings(next);
  return jsonOk(resolveSettings(next));
});
