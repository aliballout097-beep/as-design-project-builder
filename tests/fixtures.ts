import { LeadSubmissionSchema, type LeadSubmissionInput } from "@/lib/schemas/lead";

export const sampleInput: LeadSubmissionInput = {
  project: {
    type: "redesign",
    name: "Portfolio relaunch",
    services: ["web-design", "brand-identity"],
    description: "Architecture practice looking for an image-led portfolio site that wins larger commissions, with case studies.",
    goals: ["elevate-brand", "generate-leads"],
    industry: "Architecture & interiors",
    features: ["cms", "multilingual"],
    scale: "standard",
    languages: ["en", "ar"],
    references: ["dribbble.com/shots/1"],
    assets: ["logo"],
  },
  plan: { budget: "1.5k-3k", timeline: "2-4-months" },
  contact: { name: "Rana Haddad", email: "Rana@Example.com", phone: "+961 1 555 010", company: "Cedarline", consent: true },
};

export const sampleSubmission = () => LeadSubmissionSchema.parse(sampleInput);
