const SESSION_TOKEN_KEY = "ccs-token";
const TOKEN_HASH = /token=([0-9a-zA-Z]+)/;

let sessionToken: string | null = null;

function envDevToken(): string | null {
  const value = import.meta.env.VITE_CC_STUDIO_TOKEN;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function bootstrapToken(win: Window = window): string | null {
  const hashMatch = TOKEN_HASH.exec(win.location.hash);
  if (hashMatch) {
    sessionToken = hashMatch[1];
    win.sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    win.history.replaceState(null, "", `${win.location.pathname}${win.location.search}`);
    return sessionToken;
  }

  const stored = win.sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (stored) {
    sessionToken = stored;
    return sessionToken;
  }

  const viteToken = envDevToken();
  if (viteToken) {
    sessionToken = viteToken;
    return sessionToken;
  }

  sessionToken = null;
  // Vitest never launches via the CLI #token= URL; treat missing token as OK so unit tests can mount routes.
  if (import.meta.env.MODE === "test") {
    return "";
  }

  return null;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
