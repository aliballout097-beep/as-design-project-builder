import type { Plan, Project } from "@/lib/schemas/lead";
import { detectRequests, mergeDetection, type ScopeWithDetection } from "./detect";
import type { EstimateInput } from "./estimate";

/**
 * What a lead is priced on: the client's selections plus anything their
 * description clearly asks for (see detect.ts). Used for the stored estimate,
 * the AI brief, the plans and the proposal lines, so they all agree.
 */
export interface LeadScope {
  input: Required<Pick<EstimateInput, "services" | "features" | "items" | "timeline" | "languages" | "projectType" | "scale">>;
  added: ScopeWithDetection["added"];
}

type ScopeSource = {
  project: Pick<Project, "services" | "features" | "languages" | "type" | "scale" | "description"> & { items?: Project["items"] };
  plan: Pick<Plan, "timeline">;
};

export function leadScope({ project, plan }: ScopeSource): LeadScope {
  const merged = mergeDetection(
    { services: project.services, items: project.items ?? {} },
    detectRequests(project.description, { autoOnly: true }),
  );
  return {
    input: {
      services: merged.services,
      features: project.features,
      items: merged.items,
      timeline: plan.timeline,
      languages: project.languages,
      projectType: project.type ?? "new",
      scale: project.scale ?? "standard",
    },
    added: merged.added,
  };
}

export const hasAdditions = (added: LeadScope["added"]) => added.services.length > 0 || added.items.length > 0;
