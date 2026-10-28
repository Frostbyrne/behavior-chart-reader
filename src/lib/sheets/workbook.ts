import {
  formatScore,
  percent,
  ratingTone,
  summarize,
  type ChartSummary,
  type ReviewedChart,
} from "@/lib/chart";
import { google } from "./google";
import {
  BODY_FONT,
  CELL_FIELDS,
  PALETTE,
  TITLE_FONT,
  border,
  cell,
  color,
  dateSerial,
  gradientRule,
  heights,
  merge,
  nowSerial,
  q,
  range,
  row,
  tabColorFor,
  widths,
} from "./style";

/**
 * The teacher's workbook:
 *   Overview   one row per student, live formulas over the Daily Log
 *   Daily Log  one row per chart, newest first, filterable
 *   <student>  one tab per student; each chart is a color-coded grid shaped like the paper chart
 * Every send is a single batchUpdate, so a chart lands completely or not at all.
 */

export const OVERVIEW_ID = 0;
export const LOG_ID = 1;
const META_WORKBOOK = "bcr.workbook";
const META_STUDENT = "bcr.student";
const OVERVIEW_FIRST = 4; // row index of the first student row on Overview
const BLOCK_AT = 4; // row index where the newest chart goes on a student tab
const GOAL_COL = 230;
const PERIOD_COL = 92;

const LOG_COLUMNS: [string, number][] = [
  ["Date", 150],
  ["Student", 170],
  ["Teacher", 130],
  ["Earned", 74],
  ["Possible", 80],
  ["Score", 76],
  ["Lowest goal", 240],
  ["Notes from the chart", 340],
  ["Review notes", 220],
  ["Chart", 80],
  ["Added by", 210],
  ["Added", 140],
];

const OVERVIEW_COLUMNS: [string, number][] = [
  ["Student", 230],
  ["Charts", 80],
  ["Latest chart", 140],
  ["Latest score", 110],
  ["Average", 100],
  ["Last 10 charts", 230],
  ["", 110],
];

type SheetInfo = {
  properties: { sheetId: number; title: string; index: number; gridProperties?: { columnCount?: number } };
  developerMetadata?: { metadataKey: string; metadataValue: string }[];
};

export type Workbook = {
  id: string;
  url: string;
  title: string;
  logTitle: string;
  overviewTitle: string;
  /** Lower-cased student name → their tab. */
  students: Map<string, { name: string; sheetId: number; title: string; index: number; columns: number }>;
  /** Student names on the Overview, top to bottom. */
  overviewNames: string[];
  /** `${dateSerial}|${lower-cased name}` for every chart already in the log. */
  logged: Set<string>;
  sheets: SheetInfo[];
};

export class NotOurWorkbookError extends Error {}

function theme() {
  const c = (colorType: string, hex: string) => ({ colorType, color: color(hex) });
  return {
    primaryFontFamily: BODY_FONT,
    themeColors: [
      c("TEXT", PALETTE.ink),
      c("BACKGROUND", "#FFFFFF"),
      c("ACCENT1", "#2563EB"),
      c("ACCENT2", "#10B981"),
      c("ACCENT3", "#F59E0B"),
      c("ACCENT4", "#EF4444"),
      c("ACCENT5", "#8B5CF6"),
      c("ACCENT6", "#14B8A6"),
      c("LINK", "#2563EB"),
    ],
  };
}

export async function createWorkbook(token: string, title: string) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const created = await google.createSpreadsheet(token, {
    properties: { title, locale: "en_US", timeZone },
    sheets: [
      {
        properties: {
          sheetId: OVERVIEW_ID,
          title: "Overview",
          index: 0,
          tabColorStyle: color(PALETTE.ink),
          gridProperties: { rowCount: 200, columnCount: OVERVIEW_COLUMNS.length, frozenRowCount: 4, hideGridlines: true },
        },
      },
      {
        properties: {
          sheetId: LOG_ID,
          title: "Daily Log",
          index: 1,
          tabColorStyle: color(PALETTE.inkSoft),
          gridProperties: { rowCount: 1000, columnCount: LOG_COLUMNS.length, frozenRowCount: 1, frozenColumnCount: 2 },
        },
      },
    ],
  });
  await google.batchUpdate(token, created.spreadsheetId, setupRequests());
  // Fonts and colors only: a sheet without its theme still works.
  await google
    .batchUpdate(token, created.spreadsheetId, [
      { updateSpreadsheetProperties: { properties: { spreadsheetTheme: theme() }, fields: "spreadsheetTheme" } },
    ])
    .catch(() => {});
  await google.tagFile(token, created.spreadsheetId);
  return created.spreadsheetId;
}

function setupRequests(): object[] {
  const header = (text: string) =>
    cell(text.toUpperCase(), { fg: PALETTE.inkSoft, bold: true, size: 9, valign: "BOTTOM", padLeft: 8 });
  const ov = OVERVIEW_COLUMNS.length;
  const lg = LOG_COLUMNS.length;
  return [
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: META_WORKBOOK,
          metadataValue: "1",
          location: { spreadsheet: true },
          visibility: "DOCUMENT",
        },
      },
    },
    // Overview
    {
      updateCells: {
        start: { sheetId: OVERVIEW_ID, rowIndex: 0, columnIndex: 0 },
        fields: CELL_FIELDS,
        rows: [
          row([cell("Daily Behavior Charts", { font: TITLE_FONT, size: 22, bold: true, valign: "BOTTOM", padLeft: 8 })]),
          row([
            cell(
              "Every chart here was checked against the paper chart before it was sent. Scores count circled ratings only; crossed-out periods don't count.",
              { fg: PALETTE.inkSoft, size: 10, valign: "TOP", padLeft: 8 },
            ),
          ]),
          row([]),
          row(OVERVIEW_COLUMNS.map(([t]) => header(t))),
        ],
      },
    },
    merge(range(OVERVIEW_ID, 0, 1, 0, ov)),
    merge(range(OVERVIEW_ID, 1, 2, 0, ov)),
    ...widths(OVERVIEW_ID, OVERVIEW_COLUMNS.map(([, w]) => w)),
    ...heights(OVERVIEW_ID, 0, [56, 30, 14, 30]),
    {
      updateDimensionProperties: {
        range: { sheetId: OVERVIEW_ID, dimension: "ROWS", startIndex: OVERVIEW_FIRST, endIndex: 200 },
        properties: { pixelSize: 38 },
        fields: "pixelSize",
      },
    },
    { updateBorders: { range: range(OVERVIEW_ID, 3, 4, 0, ov), bottom: border(PALETTE.ink, "SOLID_MEDIUM") } },
    {
      updateBorders: {
        range: range(OVERVIEW_ID, OVERVIEW_FIRST, 200, 0, ov),
        innerHorizontal: border(PALETTE.line),
        bottom: border(PALETTE.line),
      },
    },
    gradientRule([range(OVERVIEW_ID, OVERVIEW_FIRST, 200, 3, 5)]),

    // Daily Log
    {
      updateCells: {
        start: { sheetId: LOG_ID, rowIndex: 0, columnIndex: 0 },
        fields: CELL_FIELDS,
        rows: [
          row(
            LOG_COLUMNS.map(([t], i) =>
              cell(t, {
                bg: PALETTE.ink,
                fg: "#FFFFFF",
                bold: true,
                size: 10,
                padLeft: 8,
                align: i >= 3 && i <= 5 ? "CENTER" : "LEFT",
              }),
            ),
          ),
        ],
      },
    },
    ...widths(LOG_ID, LOG_COLUMNS.map(([, w]) => w)),
    ...heights(LOG_ID, 0, [38]),
    {
      updateDimensionProperties: {
        range: { sheetId: LOG_ID, dimension: "ROWS", startIndex: 1, endIndex: 1000 },
        properties: { pixelSize: 32 },
        fields: "pixelSize",
      },
    },
    {
      addBanding: {
        bandedRange: {
          range: { sheetId: LOG_ID, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: lg },
          rowProperties: {
            headerColorStyle: color(PALETTE.ink),
            firstBandColorStyle: color("#FFFFFF"),
            secondBandColorStyle: color(PALETTE.band),
          },
        },
      },
    },
    { setBasicFilter: { filter: { range: { sheetId: LOG_ID, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: lg } } } },
    gradientRule([{ sheetId: LOG_ID, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }]),
  ];
}

export async function loadWorkbook(token: string, id: string): Promise<Workbook> {
  const s = await google.getSpreadsheet<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    developerMetadata?: { metadataKey: string }[];
    sheets: SheetInfo[];
  }>(
    token,
    id,
    "spreadsheetId,spreadsheetUrl,properties.title,developerMetadata(metadataKey),sheets(properties(sheetId,title,index,gridProperties.columnCount),developerMetadata(metadataKey,metadataValue))",
  );
  const byId = (sid: number) => s.sheets.find((sh) => sh.properties.sheetId === sid);
  const overview = byId(OVERVIEW_ID);
  const log = byId(LOG_ID);
  if (!s.developerMetadata?.some((m) => m.metadataKey === META_WORKBOOK) || !overview || !log) {
    throw new NotOurWorkbookError("That sheet wasn't made by this tool.");
  }

  const students: Workbook["students"] = new Map();
  for (const sh of s.sheets) {
    const meta = sh.developerMetadata?.find((m) => m.metadataKey === META_STUDENT);
    if (!meta) continue;
    students.set(meta.metadataValue.toLowerCase(), {
      name: meta.metadataValue,
      sheetId: sh.properties.sheetId,
      title: sh.properties.title,
      index: sh.properties.index,
      columns: sh.properties.gridProperties?.columnCount ?? 0,
    });
  }

  const values = await google.getValues(token, id, [
    `${q(overview.properties.title)}!A${OVERVIEW_FIRST + 1}:A`,
    `${q(log.properties.title)}!A2:B`,
  ]);
  const overviewNames = (values.valueRanges[0]?.values ?? []).map((r) => String(r[0] ?? ""));
  const logged = new Set(
    (values.valueRanges[1]?.values ?? [])
      .filter((r) => typeof r[0] === "number" && r[1])
      .map((r) => `${Math.floor(r[0] as number)}|${String(r[1]).toLowerCase()}`),
  );

  return {
    id: s.spreadsheetId,
    url: s.spreadsheetUrl,
    title: s.properties.title,
    overviewTitle: overview.properties.title,
    logTitle: log.properties.title,
    students,
    overviewNames,
    logged,
    sheets: s.sheets,
  };
}

/** Names already in the workbook, for the review form's student picker. */
export function knownStudents(wb: Workbook): string[] {
  const names = new Map<string, string>();
  for (const n of wb.overviewNames) if (n.trim()) names.set(n.trim().toLowerCase(), n.trim());
  for (const s of wb.students.values()) names.set(s.name.toLowerCase(), s.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function alreadyLogged(wb: Workbook, student: string, isoDate: string): boolean {
  return !!isoDate && wb.logged.has(`${Math.floor(dateSerial(isoDate))}|${student.trim().toLowerCase()}`);
}

function randomId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1_000_000 + (buf[0] % 2_000_000_000);
}

function tabTitle(wb: Workbook, name: string): string {
  const clean = name.replace(/[\[\]*?/\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Student";
  const taken = new Set(wb.sheets.map((s) => s.properties.title.toLowerCase()));
  let title = clean;
  for (let n = 2; taken.has(title.toLowerCase()); n++) title = `${clean} (${n})`;
  return title;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const pctText = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);

/** "91%  20/22" with the fraction de-emphasized. */
function scoreCell(s: { earned: number; possible: number }, o: { bg?: string; align?: "CENTER" | "RIGHT"; size?: number } = {}) {
  const p = percent(s);
  if (p === null) return cell("—", { fg: PALETTE.muted, align: o.align ?? "CENTER", bg: o.bg });
  const head = pctText(p);
  const text = `${head}  ${formatScore(s)}`;
  return cell(text, {
    align: o.align ?? "CENTER",
    bg: o.bg,
    bold: true,
    size: o.size ?? 11,
    runs: [
      { start: 0, bold: true, size: o.size ?? 11, fg: PALETTE.ink },
      { start: head.length, bold: false, size: 9, fg: PALETTE.inkSoft },
    ],
    padLeft: o.align === "RIGHT" ? 4 : undefined,
  });
}

function noteLines(chart: ReviewedChart): string {
  const parts: string[] = [];
  chart.periods.forEach((p, i) => {
    const bits: string[] = [];
    if (p.note) bits.push(p.note);
    chart.goals.forEach((g) => {
      const note = g.cells[i]?.note;
      if (note) bits.push(`${g.label}: ${note}`);
    });
    if (bits.length) parts.push(`${p.name} — ${bits.join("; ")}`);
  });
  return parts.join("   ·   ");
}

function lowestGoal(chart: ReviewedChart, sum: ChartSummary): string {
  let worst = -1;
  sum.byGoal.forEach((g, i) => {
    const p = percent(g);
    if (p === null) return;
    if (worst < 0 || p < (percent(sum.byGoal[worst]) ?? 1)) worst = i;
  });
  if (worst < 0) return "";
  const g = sum.byGoal[worst];
  return `${chart.goals[worst].label} (${formatScore(g)})`;
}

function textHeight(text: string, widthPx: number, lineHeight = 17): number {
  const perLine = Math.max(20, Math.floor(widthPx / 7));
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return Math.max(30, lines * lineHeight + 12);
}

/** Rows, merges and borders for one chart, placed at BLOCK_AT on the student's tab. */
function chartBlock(sheetId: number, chart: ReviewedChart, sum: ChartSummary, reviewNotes: string) {
  const P = chart.periods.length;
  const cols = P + 2;
  const last = cols - 1;
  const { min, max } = chart.scale;
  const panel = PALETTE.panel;

  const dateText = longDate(chart.date);
  const sub = chart.teacher ? `   ·   ${chart.teacher}` : "";
  const title = row([
    cell(dateText + sub, {
      bg: panel,
      padLeft: 10,
      runs: [
        { start: 0, bold: true, size: 12, font: TITLE_FONT, fg: PALETTE.ink },
        ...(sub ? [{ start: dateText.length, bold: false, size: 10, fg: PALETTE.inkSoft }] : []),
      ],
    }),
    ...Array.from({ length: P }, () => cell(null, { bg: panel })),
    scoreCell(sum.daily, { bg: panel, size: 12 }),
  ]);

  const hasPeriodNotes = chart.periods.some((p) => p.note);
  const header = row([
    cell("GOAL", { fg: PALETTE.muted, bold: true, size: 8, padLeft: 10, valign: "BOTTOM" }),
    ...chart.periods.map((p) => {
      const text = p.note ? `${p.name}\n${p.note}` : p.name;
      return cell(text, {
        align: "CENTER",
        valign: "BOTTOM",
        wrap: true,
        size: 9,
        bold: true,
        fg: p.crossedOut ? PALETTE.muted : PALETTE.inkSoft,
        strike: p.crossedOut,
        runs: p.note
          ? [
              { start: 0, bold: true, size: 9, strike: p.crossedOut },
              { start: p.name.length + 1, bold: false, italic: true, size: 8, fg: PALETTE.inkSoft, strike: false },
            ]
          : undefined,
      });
    }),
    cell("GOAL TOTAL", { fg: PALETTE.muted, bold: true, size: 8, align: "CENTER", valign: "BOTTOM" }),
  ]);

  const goals = chart.goals.map((g, gi) =>
    row([
      cell(g.label, { wrap: true, size: 10, bold: true, padLeft: 10 }),
      ...chart.periods.map((p, pi) => {
        const c = g.cells[pi];
        if (p.crossedOut) return cell("—", { bg: PALETTE.skip.bg, fg: PALETTE.skip.fg, align: "CENTER", note: c?.note || undefined });
        if (!c || c.state === "blank" || c.state === "crossed_out")
          return cell(null, { align: "CENTER", note: c?.note || undefined });
        if (c.state === "unclear" || c.value === null)
          return cell("?", {
            align: "CENTER",
            fg: PALETTE.mid.fg,
            note: [c.note, "Unclear on the paper chart; not counted."].filter(Boolean).join("\n"),
          });
        const tone = PALETTE[ratingTone(c.value, min, max)];
        return cell(c.value, { bg: tone.bg, fg: tone.fg, bold: true, size: 12, align: "CENTER", note: c.note || undefined });
      }),
      scoreCell(sum.byGoal[gi]),
    ]),
  );

  const totals = row([
    cell("PERIOD TOTAL", { fg: PALETTE.muted, bold: true, size: 8, padLeft: 10 }),
    ...sum.byPeriod.map((s) =>
      cell(s.skipped || s.possible === 0 ? "—" : formatScore(s), { align: "CENTER", size: 10, fg: PALETTE.inkSoft }),
    ),
    scoreCell(sum.daily),
  ]);

  const extras: [string, string][] = [];
  if (chart.dailyNotes.trim()) extras.push(["NOTES", chart.dailyNotes.trim()]);
  const onChart = noteLines(chart);
  if (onChart) extras.push(["ON THE CHART", onChart]);
  if (reviewNotes.trim()) extras.push(["REVIEW NOTES", reviewNotes.trim()]);
  const mergedWidth = P * PERIOD_COL + PERIOD_COL;
  const extraRows = extras.map(([label, text]) =>
    row([
      cell(label, { fg: PALETTE.muted, bold: true, size: 8, padLeft: 10, valign: "TOP" }),
      cell(text, { wrap: true, size: 10, fg: PALETTE.inkSoft, valign: "TOP" }),
      ...Array.from({ length: P }, () => cell(null)),
    ]),
  );

  const rows = [title, header, ...goals, totals, ...extraRows, row([])];
  const top = BLOCK_AT;
  const headerRow = top + 1;
  const firstGoal = top + 2;
  const totalsRow = firstGoal + chart.goals.length;
  const end = totalsRow + 1 + extraRows.length; // exclusive, before the spacer

  const requests: object[] = [
    {
      insertDimension: {
        range: { sheetId, dimension: "ROWS", startIndex: top, endIndex: top + rows.length },
        // the blank row above, not the previous chart's title band
        inheritFromBefore: true,
      },
    },
    { updateCells: { start: { sheetId, rowIndex: top, columnIndex: 0 }, rows, fields: CELL_FIELDS } },
    merge(range(sheetId, top, top + 1, 0, last)),
    ...extraRows.map((_, i) => merge(range(sheetId, totalsRow + 1 + i, totalsRow + 2 + i, 1, cols))),
    // tiles: white gutters between ratings, hairlines between rows
    {
      updateBorders: {
        range: range(sheetId, headerRow, totalsRow + 1, 0, cols),
        innerHorizontal: border(PALETTE.line),
        innerVertical: border("#FFFFFF", "SOLID_MEDIUM"),
      },
    },
    { updateBorders: { range: range(sheetId, totalsRow, totalsRow + 1, 0, cols), top: border(PALETTE.inkSoft) } },
    ...(extraRows.length
      ? [{ updateBorders: { range: range(sheetId, totalsRow + 1, end, 0, cols), innerHorizontal: border(PALETTE.line), top: border(PALETTE.line) } }]
      : []),
    {
      updateBorders: {
        range: range(sheetId, top, end, 0, cols),
        top: border(PALETTE.line),
        bottom: border(PALETTE.line),
        left: border(PALETTE.line),
        right: border(PALETTE.line),
      },
    },
    ...heights(sheetId, top, [
      38,
      hasPeriodNotes ? 58 : 46,
      ...chart.goals.map((g) => Math.max(36, textHeight(g.label, GOAL_COL - 20))),
      30,
      ...extras.map(([, t]) => textHeight(t, mergedWidth)),
      26,
    ]),
  ];
  return { requests, top, end, cols };
}

export type SendResult = { tabUrl: string; tabTitle: string; newStudent: boolean };

export async function sendChart(
  token: string,
  workbookId: string,
  chart: ReviewedChart,
  meta: { addedBy: string; reviewNotes: string },
): Promise<SendResult> {
  const wb = await loadWorkbook(token, workbookId);
  const L = q(wb.logTitle);
  const key = chart.student.trim().toLowerCase();
  const existing = wb.students.get(key);
  const name = existing?.name ?? chart.student.trim();
  const sum = summarize(chart);
  const requests: object[] = [];

  // 1. The student's tab
  let sheetId: number;
  let title: string;
  let columns: number;
  if (existing) {
    ({ sheetId, title, columns } = existing);
  } else {
    sheetId = randomId();
    title = tabTitle(wb, name);
    columns = 16;
    const later = [...wb.students.values()]
      .sort((a, b) => a.index - b.index)
      .find((s) => s.name.localeCompare(name) > 0);
    const studentFormula = (f: string) => ({ formula: f });
    requests.push(
      {
        addSheet: {
          properties: {
            sheetId,
            title,
            index: later ? later.index : wb.sheets.length,
            tabColorStyle: color(tabColorFor(name)),
            gridProperties: { rowCount: 120, columnCount: columns, frozenRowCount: 3, hideGridlines: true },
          },
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: { metadataKey: META_STUDENT, metadataValue: name, location: { sheetId }, visibility: "DOCUMENT" },
        },
      },
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 0 },
          fields: CELL_FIELDS,
          rows: [
            row([cell(name, { font: TITLE_FONT, size: 20, bold: true, valign: "BOTTOM", padLeft: 10 })]),
            row([
              cell("Daily charts, newest first. A corner mark on a rating means there's a handwritten note: hover or tap to read it.", {
                fg: PALETTE.inkSoft,
                size: 9,
                padLeft: 10,
              }),
            ]),
            row([
              cell(
                studentFormula(
                  `=IFERROR(LET(n,COUNTIF(${L}!B2:B,$A$1),e,SUMIFS(${L}!D2:D,${L}!B2:B,$A$1),p,SUMIFS(${L}!E2:E,${L}!B2:B,$A$1),d,MAXIFS(${L}!A2:A,${L}!B2:B,$A$1),n&IF(n=1," chart"," charts")&"   ·   "&TEXT(e/p,"0%")&" overall   ·   latest "&TEXT(d,"mmm d")),"No charts yet")`,
                ),
                { fg: PALETTE.ink, bold: true, size: 11, padLeft: 10 },
              ),
              cell(null),
              cell(null),
              cell(
                studentFormula(
                  `=IFERROR(SPARKLINE(QUERY(SORTN(FILTER({${L}!A2:A,${L}!F2:F},${L}!B2:B=$A$1,${L}!F2:F<>""),20,0,1,FALSE),"select Col2 order by Col1",0),{"charttype","line";"ymin",0;"ymax",1;"color","#2563EB";"linewidth",2}),"")`,
                ),
              ),
            ]),
          ],
        },
      },
      merge(range(sheetId, 0, 1, 0, 10)),
      merge(range(sheetId, 1, 2, 0, 14)),
      merge(range(sheetId, 2, 3, 0, 3)),
      merge(range(sheetId, 2, 3, 3, 9)),
      ...heights(sheetId, 0, [50, 22, 36, 12]),
      ...widths(sheetId, [GOAL_COL, ...Array(columns - 1).fill(PERIOD_COL)]),
    );
  }

  const needed = chart.periods.length + 2;
  if (needed > columns) {
    requests.push(
      { appendDimension: { sheetId, dimension: "COLUMNS", length: needed - columns } },
      ...widths(sheetId, Array(needed - columns).fill(PERIOD_COL), columns),
    );
  }

  // 2. The chart itself, newest first
  const block = chartBlock(sheetId, chart, sum, meta.reviewNotes);
  requests.push(...block.requests);
  const namedRangeId = String(randomId());
  requests.push({
    addNamedRange: {
      namedRange: {
        namedRangeId,
        name: `chart_${chart.date.replaceAll("-", "")}_${namedRangeId}`,
        range: range(sheetId, block.top, block.end, 0, block.cols),
      },
    },
  });

  // 3. The student's Overview row
  const tabLink = `=HYPERLINK("#gid=${sheetId}","Open tab ›")`;
  const linkCell = cell({ formula: tabLink }, { fg: "#2563EB", bold: true, size: 10, align: "CENTER" });
  const overviewAt = wb.overviewNames.findIndex((n) => n.trim().toLowerCase() === key);
  if (overviewAt < 0) {
    const k = wb.overviewNames.findIndex((n) => n.trim() !== "" && n.localeCompare(name) > 0);
    const at = OVERVIEW_FIRST + (k < 0 ? wb.overviewNames.length : k);
    const r = at + 1;
    const f = (formula: string, o: Parameters<typeof cell>[1]) => cell({ formula }, o);
    requests.push(
      {
        insertDimension: {
          range: { sheetId: OVERVIEW_ID, dimension: "ROWS", startIndex: at, endIndex: at + 1 },
          inheritFromBefore: at > OVERVIEW_FIRST,
        },
      },
      {
        updateCells: {
          start: { sheetId: OVERVIEW_ID, rowIndex: at, columnIndex: 0 },
          fields: CELL_FIELDS,
          rows: [
            row([
              cell(name, { bold: true, size: 11, padLeft: 8 }),
              f(`=COUNTIF(${L}!B2:B,A${r})`, { align: "CENTER" }),
              f(`=LET(d,MAXIFS(${L}!A2:A,${L}!B2:B,A${r}),IF(d=0,"",d))`, {
                pattern: { type: "DATE", pattern: "ddd, mmm d" },
                padLeft: 8,
              }),
              f(`=IFERROR(INDEX(SORTN(FILTER({${L}!A2:A,${L}!F2:F},${L}!B2:B=A${r}),1,0,1,FALSE),1,2),"")`, {
                pattern: { type: "PERCENT", pattern: "0%" },
                align: "CENTER",
                bold: true,
              }),
              f(`=IFERROR(SUMIFS(${L}!D2:D,${L}!B2:B,A${r})/SUMIFS(${L}!E2:E,${L}!B2:B,A${r}),"")`, {
                pattern: { type: "PERCENT", pattern: "0%" },
                align: "CENTER",
              }),
              f(
                `=IFERROR(SPARKLINE(QUERY(SORTN(FILTER({${L}!A2:A,${L}!F2:F},${L}!B2:B=A${r},${L}!F2:F<>""),10,0,1,FALSE),"select Col2 order by Col1",0),{"charttype","column";"ymin",0;"ymax",1;"color","#34A86B";"lowcolor","#E8833A"}),"")`,
                {},
              ),
              linkCell,
            ]),
          ],
        },
      },
      ...heights(OVERVIEW_ID, at, [38]),
    );
  } else if (!existing) {
    // The student's tab was deleted and has just been made again: point their row at it.
    requests.push({
      updateCells: {
        start: { sheetId: OVERVIEW_ID, rowIndex: OVERVIEW_FIRST + overviewAt, columnIndex: 6 },
        fields: CELL_FIELDS,
        rows: [row([linkCell])],
      },
    });
  }

  // 4. The Daily Log row, then keep the log newest first
  requests.push(
    {
      appendCells: {
        sheetId: LOG_ID,
        fields: CELL_FIELDS,
        rows: [
          row([
            cell(dateSerial(chart.date), { pattern: { type: "DATE", pattern: "ddd mmm d, yyyy" }, padLeft: 8 }),
            cell(name, { bold: true, padLeft: 8 }),
            cell(chart.teacher, { fg: PALETTE.inkSoft, padLeft: 8 }),
            cell(sum.daily.earned, { align: "CENTER" }),
            cell(sum.daily.possible, { align: "CENTER" }),
            percent(sum.daily) === null
              ? cell("", { align: "CENTER" })
              : cell(percent(sum.daily) as number, { pattern: { type: "PERCENT", pattern: "0%" }, align: "CENTER", bold: true }),
            cell(lowestGoal(chart, sum), { fg: PALETTE.inkSoft, padLeft: 8 }),
            cell([chart.dailyNotes.trim(), noteLines(chart)].filter(Boolean).join("   ·   "), { padLeft: 8 }),
            cell(meta.reviewNotes.trim(), { fg: PALETTE.inkSoft, padLeft: 8 }),
            cell({ formula: `=HYPERLINK("#rangeid=${namedRangeId}","View ›")` }, { fg: "#2563EB", bold: true, align: "CENTER" }),
            cell(meta.addedBy, { fg: PALETTE.inkSoft, padLeft: 8 }),
            cell(nowSerial(), { pattern: { type: "DATE_TIME", pattern: "mmm d, h:mm am/pm" }, fg: PALETTE.inkSoft, padLeft: 8 }),
          ]),
        ],
      },
    },
    {
      sortRange: {
        range: { sheetId: LOG_ID, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: LOG_COLUMNS.length },
        sortSpecs: [
          { dimensionIndex: 0, sortOrder: "DESCENDING" },
          { dimensionIndex: 1, sortOrder: "ASCENDING" },
        ],
      },
    },
  );

  await google.batchUpdate(token, wb.id, requests);
  return { tabUrl: `${wb.url}#gid=${sheetId}`, tabTitle: title, newStudent: !existing };
}
