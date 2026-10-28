import { z } from "zod";

/**
 * What the AI reads off one paper chart. Shared by the server (structured
 * output schema) and the browser (review form). Totals are never taken from
 * the AI: they are computed from the reviewed ratings by `summarize`.
 */
export const CellSchema = z.object({
  value: z
    .number()
    .nullable()
    .describe("The selected rating, or null when the cell is not scored."),
  state: z
    .enum(["rated", "blank", "crossed_out", "unclear"])
    .describe(
      "rated: one rating is clearly selected. blank: nothing selected. crossed_out: the cell or its period is struck through. unclear: a mark exists but you can't tell which rating it selects.",
    ),
  note: z
    .string()
    .describe('Handwriting in or beside this cell, verbatim, or "".'),
});

export const ChartReadingSchema = z.object({
  titleEdge: z
    .enum(["top", "right", "bottom", "left"])
    .describe("Which edge of the photo, as it is shown to you, the chart's printed title is closest to."),
  chartTitle: z.string().describe('Printed title of the chart, or "".'),
  studentName: z
    .string()
    .describe('Student name as written on the chart, or "" if unreadable.'),
  teacher: z.string().describe('Teacher name as written, or "".'),
  date: z
    .string()
    .describe(
      'The chart date as YYYY-MM-DD when unambiguous, otherwise "". Two-digit years are 20xx.',
    ),
  dateAsWritten: z.string().describe('The date exactly as written, or "".'),
  scale: z.object({
    min: z.number().describe("Lowest rating on the chart's key."),
    max: z.number().describe("Highest rating on the chart's key."),
    labels: z
      .array(z.object({ value: z.number(), label: z.string() }))
      .describe('The key, e.g. 2 = "Great job!".'),
  }),
  periods: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'Activity or time period label (e.g. "Math", "Recess"). Use the picture\'s caption when there is one.',
          ),
        crossedOut: z
          .boolean()
          .describe("True when the whole period is struck through or marked as not happening."),
        note: z
          .string()
          .describe('Handwriting written on or above the period header, or "".'),
        writtenTotal: z
          .string()
          .describe('The handwritten total for this period exactly as written (e.g. "7/8"), or "".'),
      }),
    )
    .describe("Periods in the order they occur in the day."),
  goals: z
    .array(
      z.object({
        label: z.string().describe("The behavior goal, as printed."),
        cells: z
          .array(CellSchema)
          .describe("One cell per period, in the same order as periods."),
      }),
    )
    .describe("Behavior goals in printed order."),
  dailyNotes: z
    .string()
    .describe('Anything written in the chart\'s general Notes area, verbatim, or "".'),
  writtenDailyTotal: z
    .string()
    .describe('The handwritten daily total or percent exactly as written, or "".'),
  uncertainties: z
    .array(z.string())
    .describe(
      "Each reading a person should double-check, one short sentence each: where it is and what is unclear.",
    ),
});

export type Cell = z.infer<typeof CellSchema>;
export type ChartReading = z.infer<typeof ChartReadingSchema>;

/** A chart after staff review: what gets sent to the sheet. */
export type ReviewedChart = ChartReading & {
  /** The roster name the teacher picked (may differ from the printed name). */
  student: string;
};

export type Score = { earned: number; possible: number };

export type ChartSummary = {
  daily: Score;
  byPeriod: (Score & { skipped: boolean })[];
  byGoal: Score[];
};

/** A cell counts toward totals only when it holds a reviewed rating in a period that happened. */
export function isScored(cell: Cell, periodCrossedOut: boolean): boolean {
  return !periodCrossedOut && cell.state === "rated" && cell.value !== null;
}

export function summarize(chart: ChartReading): ChartSummary {
  const span = Math.max(0, chart.scale.max - chart.scale.min);
  const byPeriod = chart.periods.map((p) => ({
    earned: 0,
    possible: 0,
    skipped: p.crossedOut,
  }));
  const byGoal = chart.goals.map(() => ({ earned: 0, possible: 0 }));
  const daily = { earned: 0, possible: 0 };

  chart.goals.forEach((goal, g) => {
    chart.periods.forEach((period, p) => {
      const cell = goal.cells[p];
      if (!cell || !isScored(cell, period.crossedOut)) return;
      const earned = (cell.value as number) - chart.scale.min;
      for (const s of [byPeriod[p], byGoal[g], daily]) {
        s.earned += earned;
        s.possible += span;
      }
    });
  });
  return { daily, byPeriod, byGoal };
}

export function percent(s: Score): number | null {
  return s.possible > 0 ? s.earned / s.possible : null;
}

export function formatScore(s: Score): string {
  return s.possible > 0 ? `${s.earned}/${s.possible}` : "—";
}

/**
 * Parses a handwritten total like "7/8", "7 / 8" or "88%" so it can be
 * compared with the computed one. Returns null when it can't be read.
 */
export function parseWrittenTotal(written: string): Score | { pct: number } | null {
  const frac = written.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac) return { earned: Number(frac[1]), possible: Number(frac[2]) };
  const pct = written.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return { pct: Number(pct[1]) / 100 };
  return null;
}

/** True when a handwritten total disagrees with the computed score. */
export function writtenTotalDisagrees(written: string, computed: Score): boolean {
  const parsed = parseWrittenTotal(written);
  if (!parsed) return false;
  if ("pct" in parsed) {
    const p = percent(computed);
    return p !== null && Math.abs(p - parsed.pct) > 0.01;
  }
  return parsed.earned !== computed.earned || parsed.possible !== computed.possible;
}

/**
 * Makes the AI's reading safe to edit: every goal gets exactly one cell per
 * period, ratings outside the scale become "unclear", and anything that had
 * to be fixed is added to the uncertainties.
 */
export function normalizeReading(raw: ChartReading): ChartReading {
  const reading = structuredClone(raw);
  const notes: string[] = [];
  const { min, max } = reading.scale;
  if (!(max > min)) {
    notes.push("The rating key couldn't be read; check the scale before sending.");
  }
  const width = reading.periods.length;
  for (const goal of reading.goals) {
    if (goal.cells.length !== width) {
      notes.push(
        `"${goal.label}" had ${goal.cells.length} ratings for ${width} periods; check its row.`,
      );
      goal.cells = Array.from(
        { length: width },
        (_, i) => goal.cells[i] ?? { value: null, state: "unclear", note: "" },
      );
    }
    for (const cell of goal.cells) {
      if (cell.value !== null && (cell.value < min || cell.value > max)) {
        cell.state = "unclear";
        cell.value = null;
      }
      if (cell.state === "rated" && cell.value === null) cell.state = "unclear";
      if (cell.state !== "rated" && cell.state !== "unclear") cell.value = null;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reading.date)) reading.date = "";
  reading.uncertainties = [...reading.uncertainties, ...notes];
  return reading;
}

/** Quarter turns clockwise that make the photo upright. */
export function uprightTurns(reading: Pick<ChartReading, "titleEdge">): number {
  return { top: 0, left: 1, bottom: 2, right: 3 }[reading.titleEdge] ?? 0;
}

/** Ratings colors that echo the red / yellow / green faces on paper charts. */
export function ratingTone(value: number, min: number, max: number): "low" | "mid" | "high" {
  if (max <= min) return "mid";
  const t = (value - min) / (max - min);
  if (t >= 0.999) return "high";
  if (t <= 0.001) return "low";
  return "mid";
}
