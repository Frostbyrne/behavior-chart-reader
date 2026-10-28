/**
 * Reads the fictional sample chart through AI Gateway and scores it against
 * the answer key. Spends AI credits (one request per run).
 *
 *   pnpm check:read [model]          # needs VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readChart } from "@/lib/server/read-chart";
import { summarize } from "@/lib/chart";

const answer = JSON.parse(readFileSync("fixtures/sample-chart.answer.json", "utf8"));
const image = new Uint8Array(readFileSync(process.argv[3] ?? "fixtures/sample-chart.jpg"));
if (process.argv[2]) process.env.AI_GATEWAY_MODEL = process.argv[2];

const started = Date.now();
const { reading, model } = await readChart(image, "image/jpeg");
const secs = ((Date.now() - started) / 1000).toFixed(1);

let right = 0;
let total = 0;
const misses: string[] = [];
answer.ratings.forEach((row: (number | null)[], g: number) =>
  row.forEach((want, p) => {
    if (answer.crossedOut.includes(p)) return;
    total++;
    const cell = reading.goals[g]?.cells[p];
    if (cell?.value === want) right++;
    else misses.push(`${answer.goals[g].slice(0, 18)} × ${answer.periods[p]}: want ${want}, got ${cell?.value} (${cell?.state})`);
  }),
);
const crossed = reading.periods.map((p, i) => (p.crossedOut ? i : -1)).filter((i) => i >= 0);
const s = summarize(reading);
console.log(JSON.stringify({ model, secs, titleEdge: reading.titleEdge, student: reading.studentName, teacher: reading.teacher, date: reading.date }));
console.log(`cells ${right}/${total}; crossed out ${JSON.stringify(crossed)} (want ${JSON.stringify(answer.crossedOut)}); total ${s.daily.earned}/${s.daily.possible} (want ${answer.earned}/${answer.possible})`);
console.log("periods:", reading.periods.map((p) => p.name + (p.note ? ` [${p.note}]` : "") + (p.writtenTotal ? ` ${p.writtenTotal}` : "")).join(" | "));
console.log("notes:", reading.goals.flatMap((g) => g.cells.map((c, i) => (c.note ? `${reading.periods[i]?.name}/${g.label.slice(0, 12)}: ${c.note}` : ""))).filter(Boolean).join("; "));
console.log("daily notes:", reading.dailyNotes, "| written total:", reading.writtenDailyTotal);
console.log("uncertainties:", reading.uncertainties);
if (misses.length) console.log("misses:\n  " + misses.join("\n  "));
if (process.env.SAVE_READING) writeFileSync(process.env.SAVE_READING, JSON.stringify(reading, null, 2) + "\n");
