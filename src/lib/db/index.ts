import "server-only";
import { getConfig } from "@/lib/env";
import { LocalRepository } from "./local";
import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabase";

export type { Repository } from "./repository";
export { NotFoundError } from "./repository";

const REPO_KEY = Symbol.for("asd.repository");
type GlobalWithRepo = typeof globalThis & { [REPO_KEY]?: Repository };

/**
 * Process-wide repository singleton. Stored on `globalThis` so that route
 * handlers, server components and hot-reloaded modules share one instance.
 */
export function getRepository(): Repository {
  const g = globalThis as GlobalWithRepo;
  if (!g[REPO_KEY]) {
    const config = getConfig();
    g[REPO_KEY] =
      config.dataStore === "supabase" && config.supabase
        ? new SupabaseRepository(config.supabase.url, config.supabase.serviceRoleKey)
        : new LocalRepository(config.localDataDir);
  }
  return g[REPO_KEY];
}

/** Test helper: inject a repository (e.g. an in-memory LocalRepository). */
export function setRepositoryForTests(repository: Repository | undefined) {
  (globalThis as GlobalWithRepo)[REPO_KEY] = repository;
}
