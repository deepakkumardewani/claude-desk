import { listAllCategories } from "../fs/scoped.js";
import type { Scope } from "schema";

export async function getTreeResponse(scope: Scope = "user") {
  const categories = await listAllCategories(scope);
  return {
    categories: categories.map(({ category, label, files }) => ({
      category,
      label,
      files: files.map((name) => ({ name })),
    })),
  };
}
