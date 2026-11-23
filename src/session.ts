// Session and configuration, with the same contract as the v1 client
// (hpi-schul-cloud/tldraw-client): runtime config from tldraw-server, the user
// from the SVS server, errors shown by the Nuxt client's /error page.

export type WhiteboardConfig = {
  TLDRAW_WEBSOCKET_URL: string;
  FEATURE_TLDRAW_ENABLED: boolean;
  TLDRAW_ASSETS_ENABLED: boolean;
  TLDRAW_ASSETS_MAX_SIZE_BYTES: number;
  TLDRAW_ASSETS_ALLOWED_MIME_TYPES_LIST: string[];
  NOT_AUTHENTICATED_REDIRECT_URL: string;
};

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  schoolId: string;
};

export type Session = {
  config: WhiteboardConfig;
  user: SessionUser;
  parentId: string;
};

const OBJECT_ID = /^[0-9a-f]{24}$/;

// Keys read by the Nuxt client's Error.page.vue.
export function showError(status: number, translationKey: string): never {
  try {
    localStorage.setItem("applicationErrorStatusCode", JSON.stringify(status));
    localStorage.setItem(
      "applicationErrorTranslationKey",
      JSON.stringify(translationKey),
    );
    localStorage.setItem("applicationErrorTldraw", "true");
  } catch {
    // storage blocked: the error page then shows its generic text
  }
  window.location.assign("/error");
  throw new Error(`whiteboard error ${status}`);
}

function clearError() {
  try {
    localStorage.removeItem("applicationErrorStatusCode");
    localStorage.removeItem("applicationErrorTranslationKey");
    localStorage.removeItem("applicationErrorTldraw");
  } catch {
    // ignore
  }
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string")
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

async function loadConfig(): Promise<WhiteboardConfig> {
  const res = await fetch("/api/tldraw/config/public", {
    credentials: "same-origin",
  });
  if (!res.ok) showError(500, "error.500");
  const raw = await res.json();
  return {
    TLDRAW_WEBSOCKET_URL: String(raw.TLDRAW_WEBSOCKET_URL),
    FEATURE_TLDRAW_ENABLED: Boolean(raw.FEATURE_TLDRAW_ENABLED),
    TLDRAW_ASSETS_ENABLED: Boolean(raw.TLDRAW_ASSETS_ENABLED),
    TLDRAW_ASSETS_MAX_SIZE_BYTES:
      Number(raw.TLDRAW_ASSETS_MAX_SIZE_BYTES) || 10 * 1024 * 1024,
    TLDRAW_ASSETS_ALLOWED_MIME_TYPES_LIST: toList(
      raw.TLDRAW_ASSETS_ALLOWED_MIME_TYPES_LIST,
    ),
    NOT_AUTHENTICATED_REDIRECT_URL: String(
      raw.NOT_AUTHENTICATED_REDIRECT_URL || "/login",
    ),
  };
}

export async function loadSession(): Promise<Session> {
  clearError();
  const parentId =
    new URLSearchParams(window.location.search).get("parentId") ?? "";
  if (!OBJECT_ID.test(parentId)) showError(404, "error.404");

  const config = await loadConfig();
  if (!config.FEATURE_TLDRAW_ENABLED) showError(403, "error.403");

  const res = await fetch("/api/v3/me", { credentials: "same-origin" });
  if (res.status === 401) {
    const back = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      `${config.NOT_AUTHENTICATED_REDIRECT_URL}?redirect=${encodeURIComponent(back)}`,
    );
    throw new Error("not authenticated");
  }
  if (!res.ok) showError(500, "error.500");
  const me = await res.json();
  return {
    config,
    parentId,
    user: {
      id: me.user.id,
      firstName: me.user.firstName ?? "",
      lastName: me.user.lastName ?? "",
      schoolId: me.school.id,
    },
  };
}
