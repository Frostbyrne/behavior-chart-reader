/** Look and feel of the Google Sheet, plus small builders for Sheets API cell data. */

export const PALETTE = {
  ink: "#1F2A44",
  inkSoft: "#475569",
  muted: "#94A3B8",
  line: "#E2E8F0",
  panel: "#EEF2F7",
  band: "#F7F9FC",
  paper: "#FFFFFF",
  high: { bg: "#D7F0DF", fg: "#14663A" },
  mid: { bg: "#FFF0BF", fg: "#875A00" },
  low: { bg: "#FBD9D6", fg: "#B42318" },
  skip: { bg: "#F1F4F8", fg: "#A0AEC0" },
  /** Score gradient: 50% and below, 80%, 100%. */
  gradient: { low: "#F7C6C2", mid: "#FFE6A1", high: "#BFE6CC" },
} as const;

export const TITLE_FONT = "Lexend";
export const BODY_FONT = "Inter";

const TAB_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1"];

export function tabColorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAB_COLORS[h % TAB_COLORS.length];
}

export function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

export const color = (hex: string) => ({ rgbColor: rgb(hex) });

export type Value = string | number | { formula: string } | null;

export type CellOpts = {
  bg?: string;
  fg?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  size?: number;
  font?: string;
  align?: "LEFT" | "CENTER" | "RIGHT";
  valign?: "TOP" | "MIDDLE" | "BOTTOM";
  wrap?: boolean;
  pattern?: { type: "DATE" | "DATE_TIME" | "PERCENT" | "NUMBER" | "TEXT"; pattern: string };
  note?: string;
  /** Rich text: extra styling for parts of a string value. */
  runs?: { start: number; fg?: string; bold?: boolean; italic?: boolean; size?: number; font?: string; strike?: boolean }[];
  padLeft?: number;
};

function textFormat(o: { fg?: string; bold?: boolean; italic?: boolean; strike?: boolean; size?: number; font?: string }) {
  return {
    ...(o.fg ? { foregroundColorStyle: color(o.fg) } : {}),
    ...(o.bold !== undefined ? { bold: o.bold } : {}),
    ...(o.italic !== undefined ? { italic: o.italic } : {}),
    ...(o.strike !== undefined ? { strikethrough: o.strike } : {}),
    ...(o.size ? { fontSize: o.size } : {}),
    ...(o.font ? { fontFamily: o.font } : {}),
  };
}

export function cell(value: Value, o: CellOpts = {}) {
  const userEnteredValue =
    value === null
      ? undefined
      : typeof value === "number"
        ? { numberValue: value }
        : typeof value === "string"
          ? { stringValue: value }
          : { formulaValue: value.formula };
  return {
    ...(userEnteredValue ? { userEnteredValue } : {}),
    userEnteredFormat: {
      ...(o.bg ? { backgroundColorStyle: color(o.bg) } : {}),
      horizontalAlignment: o.align ?? "LEFT",
      verticalAlignment: o.valign ?? "MIDDLE",
      wrapStrategy: o.wrap ? "WRAP" : "CLIP",
      textFormat: textFormat({ fg: o.fg ?? PALETTE.ink, size: o.size ?? 10, ...o }),
      ...(o.pattern ? { numberFormat: o.pattern } : {}),
      ...(o.padLeft ? { padding: { left: o.padLeft, right: 4, top: 2, bottom: 2 } } : {}),
    },
    ...(o.note ? { note: o.note } : {}),
    ...(o.runs?.length
      ? { textFormatRuns: o.runs.map((r) => ({ startIndex: r.start, format: textFormat(r) })) }
      : {}),
  };
}

export const CELL_FIELDS = "userEnteredValue,userEnteredFormat,note,textFormatRuns";

export const row = (cells: object[]) => ({ values: cells });

export const range = (sheetId: number, r0: number, r1: number, c0: number, c1: number) => ({
  sheetId,
  startRowIndex: r0,
  endRowIndex: r1,
  startColumnIndex: c0,
  endColumnIndex: c1,
});

export const border = (hex: string, style = "SOLID") => ({ style, colorStyle: color(hex) });

export const widths = (sheetId: number, sizes: number[], start = 0) =>
  sizes.map((pixelSize, i) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: start + i, endIndex: start + i + 1 },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  }));

export const heights = (sheetId: number, start: number, sizes: number[]) =>
  sizes.map((pixelSize, i) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: start + i, endIndex: start + i + 1 },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  }));

export const merge = (r: ReturnType<typeof range>) => ({ mergeCells: { range: r, mergeType: "MERGE_ALL" } });

export type GridRange = { sheetId: number; startRowIndex: number; endRowIndex?: number; startColumnIndex: number; endColumnIndex: number };

export const gradientRule = (ranges: GridRange[]) => ({
  addConditionalFormatRule: {
    index: 0,
    rule: {
      ranges,
      gradientRule: {
        minpoint: { colorStyle: color(PALETTE.gradient.low), type: "NUMBER", value: "0.5" },
        midpoint: { colorStyle: color(PALETTE.gradient.mid), type: "NUMBER", value: "0.8" },
        maxpoint: { colorStyle: color(PALETTE.gradient.high), type: "NUMBER", value: "1" },
      },
    },
  },
});

/** Sheets stores dates as days since 1899-12-30. */
export function dateSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25_569;
}

export function nowSerial(): number {
  const now = new Date();
  return (now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000 + 25_569;
}

/** Quotes a sheet title for use in a formula or A1 range. */
export const q = (title: string) => `'${title.replace(/'/g, "''")}'`;
