import "server-only";
import { translateProposalToArabic } from "@/lib/ai/translate";
import { getRepository } from "@/lib/db";
import type { Proposal } from "@/lib/types";

/**
 * Returns the proposal with a cached Arabic translation attached, computing
 * and persisting one if missing or stale (the proposal changed since it was
 * last translated). Returns the proposal unchanged if Claude isn't configured
 * or the translation call fails — the PDF then renders English-only.
 */
export async function withArabicTranslation(proposal: Proposal): Promise<Proposal> {
  if (proposal.translations && proposal.translations.forUpdatedAt === proposal.updatedAt) return proposal;

  const ar = await translateProposalToArabic(proposal);
  if (!ar) return proposal;

  const translations = { ar, forUpdatedAt: proposal.updatedAt };
  try {
    return await getRepository().updateProposal(proposal.id, { translations });
  } catch (error) {
    console.error(`[pdf] could not persist Arabic translation for proposal ${proposal.id}`, error);
    return { ...proposal, translations };
  }
}
