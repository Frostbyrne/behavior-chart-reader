/**
 * Minimal Google REST client for the browser. Reviewed charts go from the
 * teacher's browser straight to Google with the teacher's own access token;
 * this app's server never sees them.
 */

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let message = `Google returned ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {}
    throw new GoogleApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

/** Marks workbooks made by this app so they can be found again from another device. */
export const APP_PROPERTY = "behaviorChartReader";

export type DriveSheet = { id: string; name: string; modifiedTime: string; webViewLink: string };

export const google = {
  createSpreadsheet: (token: string, body: object) =>
    call<{ spreadsheetId: string; spreadsheetUrl: string }>(token, SHEETS, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSpreadsheet: <T>(token: string, id: string, fields: string) =>
    call<T>(token, `${SHEETS}/${id}?fields=${encodeURIComponent(fields)}`),

  batchUpdate: (token: string, id: string, requests: object[]) =>
    call<{ replies: object[] }>(token, `${SHEETS}/${id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    }),

  getValues: (token: string, id: string, ranges: string[]) =>
    call<{ valueRanges: { range: string; values?: unknown[][] }[] }>(
      token,
      `${SHEETS}/${id}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&${ranges
        .map((r) => `ranges=${encodeURIComponent(r)}`)
        .join("&")}`,
    ),

  tagFile: (token: string, id: string) =>
    call(token, `${DRIVE}/${id}?fields=id`, {
      method: "PATCH",
      body: JSON.stringify({ appProperties: { [APP_PROPERTY]: "1" } }),
    }),

  /** With the drive.file scope this only ever lists files this app created or was given. */
  listWorkbooks: async (token: string) => {
    const q = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and appProperties has { key='${APP_PROPERTY}' and value='1' }`;
    const res = await call<{ files: DriveSheet[] }>(
      token,
      `${DRIVE}?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime,webViewLink)`,
    );
    return res.files;
  },
};
