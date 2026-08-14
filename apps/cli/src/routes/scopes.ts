import { projectScopeExists } from "../fs/scoped.js";
import { isInvalidProjectDir } from "./scopeQuery.js";

export async function getScopesResponse(projectDir?: string) {
  try {
    const projectExists = await projectScopeExists(projectDir);
    const scopes = projectExists ? ["user", "project"] : ["user"];

    return {
      status: 200 as const,
      body: {
        scopes,
        projectPath: projectExists && projectDir ? projectDir : null,
      },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    throw error;
  }
}
