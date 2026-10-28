import "server-only";
import { generateText, Output } from "ai";
import { ChartReadingSchema, normalizeReading, type ChartReading } from "@/lib/chart";

const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

const SYSTEM = `You transcribe paper daily behavior charts for classroom staff, who review every reading before it is saved.

How these charts work:
- Each chart is one student's day. Rows (or columns) are behavior goals; the other axis is the day's activities or periods, often shown as pictures with captions.
- Each goal/period cell offers a rating scale, usually printed numbers under faces (for example red 0, yellow 1, green 2). Staff select a rating by circling, checking, highlighting or coloring it.
- A key on the chart explains the scale (for example "2 = Great job!, 1 = OK, 0 = Difficult time").
- Staff often write short notes in cells or above a period, and may write per-period totals like "7/8".

Rules:
- Use only what is visible. Never guess, never invent, never fill in a pattern.
- The photo may be rotated, skewed or taken at an angle. Read it in its natural orientation, so periods follow the order of the day.
- Printed faces and numbers that are not circled or marked are not ratings. A cell with no mark is "blank".
- If a whole period is crossed out, scribbled through, or marked as not happening, set crossedOut for that period and mark its cells crossed_out.
- If a mark is ambiguous (between two numbers, two circles, erased), use state "unclear" with value null and add an uncertainty that says where it is.
- Copy handwriting verbatim, including misspellings. Use "?" for a word you can't read.
- Copy handwritten totals exactly as written. Do not compute or correct them.
- Leave out anything that is not part of a classroom behavior chart (student ID numbers, medical, counseling, IEP/504 or discipline details) and add an uncertainty saying something was left out.
- Every goal must have exactly one cell per period, in the same order as periods.`;

export async function readChart(image: Uint8Array, mediaType: string, signal?: AbortSignal) {
  const model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.AI_GATEWAY_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const result = await generateText({
    model,
    system: SYSTEM,
    output: Output.object({ schema: ChartReadingSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this daily behavior chart." },
          { type: "file", mediaType, data: image },
        ],
      },
    ],
    reasoning: "medium",
    maxRetries: 1,
    abortSignal: signal,
    providerOptions: {
      gateway: {
        // Only providers with zero-data-retention agreements may see a chart.
        zeroDataRetention: true,
        ...(fallbacks.length ? { models: fallbacks } : {}),
        tags: ["behavior-chart-reader"],
      },
    },
  });

  return {
    reading: normalizeReading(result.output as ChartReading),
    model: result.response.modelId ?? model,
  };
}
