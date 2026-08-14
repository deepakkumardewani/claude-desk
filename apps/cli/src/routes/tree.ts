import { listAllCategories } from "../fs/scoped.js";
import type { Scope } from "schema";
import { isInvalidProjectDir } from "./scopeQuery.js";

export async function getTreeResponse(scope: Scope = "user", projectDir?: string) {
  try {
    const categories = await listAllCategories(scope, projectDir);
    return {
      status: 200 as const,
      body: {
        categories: categories.map(({ category, label, files }) => ({
          category,
          label,
          files: files.map((name) => ({ name })),
        })),
      },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    throw error;
  }
}
