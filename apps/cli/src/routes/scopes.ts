import { projectScopeExists } from "../fs/scoped.js";

export async function getScopesResponse() {
  const projectExists = await projectScopeExists();
  const availableScopes = ["user"];

  if (projectExists) {
    availableScopes.push("project");
  }

  return {
    status: 200 as const,
    body: {
      scopes: availableScopes,
      projectPath: projectExists ? process.cwd() : null,
    },
  };
}
