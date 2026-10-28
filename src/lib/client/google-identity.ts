/**
 * Google Identity Services token flow. The access token lives only in memory
 * (React state): it is never written to storage or cookies, and signing out
 * revokes it.
 */

export const SCOPES = [
  "openid",
  "email",
  "profile",
  // Only files this app creates or is handed: never the rest of the teacher's Drive.
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type TokenClient = { requestAccessToken: (o?: { prompt?: string; hint?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
            hd?: string;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
          hasGrantedAllScopes: (r: TokenResponse, ...scopes: string[]) => boolean;
        };
      };
    };
  }
}

export type Session = {
  token: string;
  expiresAt: number;
  email: string;
  name: string;
  picture: string;
};

let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function signIn(clientId: string, hint?: string): Promise<Session> {
  await loadGoogleIdentity();
  const oauth2 = window.google!.accounts.oauth2;
  const response = await new Promise<TokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: resolve,
      error_callback: (e) =>
        reject(new Error(e.type === "popup_closed" ? "Sign-in was closed before it finished." : e.message || "Sign-in failed.")),
    });
    client.requestAccessToken({ prompt: hint ? "" : "select_account", hint });
  });
  if (response.error || !response.access_token) {
    throw new Error(response.error_description || "Google didn't grant access.");
  }
  if (!oauth2.hasGrantedAllScopes(response, "https://www.googleapis.com/auth/drive.file")) {
    throw new Error("Allow access to the sheets this app creates, or it can't save your charts.");
  }
  const me = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${response.access_token}` },
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't read your Google profile."))));
  return {
    token: response.access_token,
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
    email: me.email ?? "",
    name: me.name ?? me.email ?? "",
    picture: me.picture ?? "",
  };
}

export function signOut(session: Session | null) {
  if (session && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(session.token);
}
