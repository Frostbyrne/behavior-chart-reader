import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The whole teacher flow with Google and the AI faked at the network edge:
 * sign in → create sheet → upload photo → review → send. Asserts what would
 * be written to the sheet. Screenshots land in test-results/.
 */

const reading = JSON.parse(readFileSync("fixtures/sample-chart.reading.json", "utf8"));

type Sheet = {
  properties: { sheetId: number; title: string; index: number; gridProperties: { columnCount: number } };
  developerMetadata: { metadataKey: string; metadataValue: string }[];
};
type Req = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fakeGoogle(page: Page) {
  const batches: { requests: Req[] }[] = [];
  const sheets: Sheet[] = [];
  const workbookMeta: { metadataKey: string }[] = [];
  const log: unknown[][] = [];
  const overview: unknown[][] = [];
  const json = (route: Route, body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  const addSheet = (p: Req) =>
    sheets.push({ properties: { ...p, gridProperties: { columnCount: p.gridProperties.columnCount } } as Sheet["properties"], developerMetadata: [] });

  return {
    batches,
    async install() {
      await page.route("https://accounts.google.com/gsi/client", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `window.google={accounts:{oauth2:{
            initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:"fake-token",expires_in:3600,scope:"openid email profile https://www.googleapis.com/auth/drive.file"}),50)}),
            revoke:()=>{},hasGrantedAllScopes:()=>true}}};`,
        }),
      );
      await page.route("https://www.googleapis.com/oauth2/v3/userinfo", (r) =>
        json(r, { email: "pat.teacher@example.org", name: "Pat Teacher", picture: "" }),
      );
      await page.route("https://www.googleapis.com/drive/v3/files**", (r) =>
        r.request().method() === "PATCH" ? json(r, { id: "wb1" }) : json(r, { files: [] }),
      );
      await page.route("https://sheets.googleapis.com/v4/spreadsheets**", async (route) => {
        const req = route.request();
        const url = req.url();
        if (req.method() === "POST" && url.endsWith("/spreadsheets")) {
          for (const s of req.postDataJSON().sheets) addSheet(s.properties);
          return json(route, { spreadsheetId: "wb1", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/wb1/edit" });
        }
        if (url.includes(":batchUpdate")) {
          const body = req.postDataJSON();
          batches.push(body);
          for (const r of body.requests as Req[]) {
            if (r.addSheet) addSheet(r.addSheet.properties);
            const dm = r.createDeveloperMetadata?.developerMetadata;
            if (dm?.location.spreadsheet) workbookMeta.push({ metadataKey: dm.metadataKey });
            else if (dm) sheets.find((s) => s.properties.sheetId === dm.location.sheetId)?.developerMetadata.push(dm);
            if (r.appendCells) {
              const v = r.appendCells.rows[0].values;
              log.push([v[0].userEnteredValue.numberValue, v[1].userEnteredValue.stringValue]);
            }
            const uc = r.updateCells;
            if (uc?.start.sheetId === 0 && uc.start.rowIndex >= 4 && uc.start.columnIndex === 0)
              overview.push([uc.rows[0].values[0].userEnteredValue.stringValue]);
          }
          return json(route, { replies: [] });
        }
        if (url.includes("/values:batchGet")) return json(route, { valueRanges: [{ values: overview }, { values: log }] });
        return json(route, {
          spreadsheetId: "wb1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/wb1/edit",
          properties: { title: "Behavior Charts 2026–27" },
          developerMetadata: workbookMeta,
          sheets,
        });
      });
      await page.route("**/api/read", async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        return json(route, { reading, model: "anthropic/claude-sonnet-5.5" });
      });
    },
  };
}

test("photo to sheet", async ({ page }) => {
  const google = fakeGoogle(page);
  await google.install();

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Sign in with Google/ })).toBeVisible();
  await page.screenshot({ path: "test-results/1-signed-out.png", fullPage: true });

  await page.getByRole("button", { name: /Sign in with Google/ }).click();
  await expect(page.getByRole("heading", { name: "Where should charts go?" })).toBeVisible();
  await page.screenshot({ path: "test-results/2-pick-sheet.png", fullPage: true });

  await page.getByRole("button", { name: /Create sheet/ }).click();
  await expect(page.getByRole("heading", { name: "Add today's charts" })).toBeVisible();
  const setup = google.batches[0].requests;
  expect(setup.some((r) => "addBanding" in r)).toBe(true);
  expect(setup.some((r) => "setBasicFilter" in r)).toBe(true);

  await page.locator("input[type=file][multiple]").setInputFiles("fixtures/sample-chart.jpg");
  await expect(page.getByRole("heading", { name: "Reading the chart…" })).toBeVisible();
  await page.screenshot({ path: "test-results/3-reading.png", fullPage: true });

  await expect(page.getByRole("heading", { name: "Check this chart" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Student", { exact: true })).toHaveValue("Jordan Rivera");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue("2026-10-21");
  await expect(page.getByText("79 of 88 points")).toBeVisible();
  await expect(page.getByAltText("Photo of the paper behavior chart")).toBeVisible();
  await page.screenshot({ path: "test-results/4-review.png", fullPage: true });

  // Keyboard edits: Small Group / Listen and Follow Directions → 2, then back to 1
  const smallGroup = page.locator('[data-cell="0-9"]');
  await smallGroup.click();
  await page.screenshot({ path: "test-results/5-cell-selected.png" });
  await smallGroup.press("2");
  await expect(page.getByText("80 of 88 points")).toBeVisible();
  await smallGroup.click();
  await smallGroup.press("1");
  await expect(page.getByText("79 of 88 points")).toBeVisible();

  const send = page.getByRole("button", { name: "Send to Google Sheet" });
  await expect(send).toBeDisabled();
  await page.getByLabel(/I checked the student, date and every rating/).check();
  await send.click();
  await expect(page.getByRole("heading", { name: "Sent to your sheet" })).toBeVisible();
  await page.screenshot({ path: "test-results/6-sent.png", fullPage: true });

  const write = google.batches.at(-1)!.requests;
  const kinds = write.map((r) => Object.keys(r)[0]);
  for (const k of ["addSheet", "insertDimension", "addNamedRange", "appendCells", "sortRange"]) expect(kinds).toContain(k);
  expect(write.find((r) => r.addSheet)!.addSheet.properties.title).toBe("Jordan Rivera");
  const logRow = write.find((r) => r.appendCells)!.appendCells.rows[0].values;
  expect(logRow[1].userEnteredValue.stringValue).toBe("Jordan Rivera");
  expect(logRow[3].userEnteredValue.numberValue).toBe(79);
  expect(logRow[4].userEnteredValue.numberValue).toBe(88);
  expect(logRow[10].userEnteredValue.stringValue).toBe("pat.teacher@example.org");

  // Same chart again: the student exists now, and it's a duplicate for that date.
  await page.locator("input[type=file][multiple]").setInputFiles("fixtures/sample-chart.jpg");
  await expect(page.getByRole("heading", { name: "Check this chart" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Already in your sheet")).toBeVisible();
  await expect(page.getByText("already has a chart for this date")).toBeVisible();
  await page.screenshot({ path: "test-results/7-duplicate.png", fullPage: true });
});
