import { apiFetch } from "../lib/sessionApi";

export type ContextItem = {
  name: string;
  tokens?: number;
};

export type ContextGroup = {
  name: string;
  tokens: number;
  items: ContextItem[];
};

export type ContextCategory = {
  name: string;
  tokens: number;
  percentage: number;
  items?: ContextItem[];
  groups?: ContextGroup[];
};

export type ContextDetails = {
  model: string; // e.g., "Sonnet 4.6"
  model_id: string; // e.g., "claude-sonnet-4-6"
  total_tokens: number;
  max_tokens: number;
  percentage: number;
  is_estimated: boolean;
  categories: ContextCategory[];
};

export type ContextDetailsResponse =
  | { success: true; data: ContextDetails }
  | { success: false; error: string };

/**
 * Fetch context details from /api/context/all.
 * Pass the active workspace so Claude is spawned in that project directory.
 */
export async function fetchContextDetails(
  scope: "user" | "project" = "user",
  projectDir?: string,
): Promise<ContextDetailsResponse> {
  try {
    const params = new URLSearchParams({ scope });
    if (projectDir) {
      params.set("projectDir", projectDir);
    }
    const response = await apiFetch(`/api/context/all?${params.toString()}`);
    const json = await response.json();
    if (!response.ok || !json.success) {
      return { success: false, error: json.error || "Failed to fetch" };
    }
    return { success: true, data: json };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch context details",
    };
  }
}
