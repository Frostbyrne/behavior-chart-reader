"use client";

import { useMemo, useState } from "react";
import { percent, summarize, uprightTurns, writtenTotalDisagrees, type ReviewedChart } from "@/lib/chart";
import { matchStudent } from "@/lib/client/students";
import type { Item } from "./app";
import { AlertIcon, CheckIcon, ExternalIcon, SparkIcon, TrashIcon } from "./icons";
import { PhotoViewer } from "./photo-viewer";
import { RatingGrid } from "./rating-grid";

const field =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "text-xs font-semibold text-ink-soft";

export function ReviewPanel({
  item,
  students,
  isLogged,
  onChange,
  onSend,
  onDiscard,
  onRetry,
}: {
  item: Item;
  students: string[];
  isLogged: (student: string, date: string) => boolean;
  onChange: (patch: Partial<Item>) => void;
  onSend: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  if (item.status === "preparing" || item.status === "reading") return <Reading item={item} />;
  if (item.status === "error" && !item.draft) return <Failed item={item} onRetry={onRetry} onDiscard={onDiscard} />;
  if (item.status === "sent") return <Sent item={item} />;
  return (
    <Review
      item={item}
      students={students}
      isLogged={isLogged}
      onChange={onChange}
      onSend={onSend}
      onDiscard={onDiscard}
    />
  );
}

function Review({
  item,
  students,
  isLogged,
  onChange,
  onSend,
  onDiscard,
}: {
  item: Item;
  students: string[];
  isLogged: (student: string, date: string) => boolean;
  onChange: (patch: Partial<Item>) => void;
  onSend: () => void;
  onDiscard: () => void;
}) {
  const chart = item.draft!;
  const [sendAnyway, setSendAnyway] = useState(false);
  const set = (patch: Partial<ReviewedChart>) => onChange({ draft: { ...chart, ...patch }, checked: false });
  const sum = useMemo(() => summarize(chart), [chart]);
  const pct = percent(sum.daily);
  const match = matchStudent(chart.student, students);
  const printed = item.original?.studentName ?? "";
  const printedMatch = printed ? matchStudent(printed, students) : null;
  const suggestion =
    printedMatch?.kind === "close" && printedMatch.name !== chart.student ? printedMatch.name : null;

  const unclear = chart.goals.reduce(
    (n, g) => n + g.cells.filter((c, i) => !chart.periods[i]?.crossedOut && (c.state === "unclear" || (c.state === "rated" && c.value === null))).length,
    0,
  );
  const dailyOff = chart.writtenDailyTotal && writtenTotalDisagrees(chart.writtenDailyTotal, sum.daily);
  const periodsOff = sum.byPeriod.filter(
    (s, i) => !s.skipped && chart.periods[i].writtenTotal && writtenTotalDisagrees(chart.periods[i].writtenTotal, s),
  ).length;
  const duplicate = isLogged(chart.student, chart.date);

  const blockers = [
    (chart.periods.length === 0 || chart.goals.length === 0) && "No goals or periods were found on this chart. Try a clearer photo.",
    !chart.student.trim() && "Choose the student.",
    !chart.date && "Add the chart's date.",
    unclear > 0 && `${unclear} rating${unclear === 1 ? " is" : "s are"} still unclear. Pick a rating or mark ${unclear === 1 ? "it" : "them"} not rated.`,
    duplicate && !sendAnyway && "This student already has a chart for this date in the sheet.",
  ].filter(Boolean) as string[];
  const canSend = blockers.length === 0 && item.checked && item.status !== "sending";

  return (
    <section className="rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(31,42,68,0.05)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Check this chart</h2>
          <p className="text-sm text-ink-soft">Compare every rating with the paper. Nothing is sent until you say so.</p>
        </div>
        <button
          onClick={onDiscard}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-soft hover:bg-low hover:text-low-ink"
        >
          <TrashIcon /> Discard
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {item.photoUrl && <PhotoViewer src={item.photoUrl} initialTurns={uprightTurns(chart)} />}

        <div className="grid content-start gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="student" className={label}>
                Student
              </label>
              <input
                id="student"
                list="known-students"
                value={chart.student}
                onChange={(e) => set({ student: e.target.value })}
                className={`${field} mt-1 text-base font-semibold`}
                placeholder="Student's name"
                autoComplete="off"
              />
              <datalist id="known-students">
                {students.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                {match.kind === "exact" ? (
                  <span className="inline-flex items-center gap-1 font-medium text-high-ink">
                    <CheckIcon /> Already in your sheet
                  </span>
                ) : chart.student.trim() ? (
                  <span className="text-ink-soft">New student: a tab will be made for them.</span>
                ) : null}
                {suggestion && (
                  <button onClick={() => set({ student: suggestion })} className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">
                    Use “{suggestion}”?
                  </button>
                )}
                {printed && printed !== chart.student && <span className="text-muted">Chart says “{printed}”</span>}
              </div>
            </div>
            <div>
              <label htmlFor="date" className={label}>
                Date
              </label>
              <input id="date" type="date" value={chart.date} onChange={(e) => set({ date: e.target.value })} className={`${field} mt-1`} />
              {chart.dateAsWritten && (
                <div className="mt-1 text-xs text-muted">Chart says “{chart.dateAsWritten}”</div>
              )}
            </div>
            <div>
              <label htmlFor="teacher" className={label}>
                Teacher
              </label>
              <input id="teacher" value={chart.teacher} onChange={(e) => set({ teacher: e.target.value })} className={`${field} mt-1`} />
            </div>
          </div>

          <div className="flex items-stretch gap-3 rounded-2xl bg-canvas p-4">
            <div className="flex-1">
              <div className={label}>Today&apos;s score</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tracking-tight">{pct === null ? "—" : `${Math.round(pct * 100)}%`}</span>
                <span className="text-sm text-ink-soft">
                  {sum.daily.earned} of {sum.daily.possible} points
                </span>
              </div>
              <div className="mt-1 text-xs text-ink-soft">
                Scale {chart.scale.min}–{chart.scale.max}
                {chart.scale.labels.length > 0 && ` · ${chart.scale.labels.map((l) => `${l.value} = ${l.label}`).join(", ")}`}
              </div>
            </div>
            {chart.writtenDailyTotal && (
              <div className={`w-36 rounded-xl px-3 py-2 text-sm ${dailyOff ? "bg-low text-low-ink" : "bg-white text-ink-soft"}`}>
                <div className="text-xs font-semibold">Written on paper</div>
                <div className="mt-0.5 font-semibold">{chart.writtenDailyTotal}</div>
                {dailyOff ? <div className="text-xs">Doesn&apos;t match</div> : <div className="text-xs">Matches ✓</div>}
              </div>
            )}
          </div>

          {(chart.uncertainties.length > 0 || periodsOff > 0) && (
            <div className="rounded-2xl border border-mid-ink/20 bg-mid/50 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-mid-ink">
                <SparkIcon /> Double-check these on the paper
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                {chart.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
                {periodsOff > 0 && (
                  <li>
                    {periodsOff} period total{periodsOff === 1 ? "" : "s"} written on the paper {periodsOff === 1 ? "doesn't" : "don't"} match the
                    circled ratings (marked “paper:” under the grid).
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="2xl:col-span-2">
          <RatingGrid chart={chart} original={item.original} onChange={(draft) => onChange({ draft, checked: false })} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:col-span-2">
          <label className={label}>
            Notes from the chart
            <textarea
              value={chart.dailyNotes}
              onChange={(e) => set({ dailyNotes: e.target.value })}
              rows={3}
              className={`${field} mt-1 font-normal`}
              placeholder="Anything written in the chart's Notes area"
            />
          </label>
          <label className={label}>
            Your review notes <span className="font-normal text-muted">(optional, goes to the sheet)</span>
            <textarea
              value={item.reviewNotes}
              onChange={(e) => onChange({ reviewNotes: e.target.value })}
              rows={3}
              className={`${field} mt-1 font-normal`}
              placeholder="e.g. Recess rating confirmed with para"
            />
          </label>
        </div>
      </div>

      <div className="sticky bottom-0 rounded-b-2xl border-t border-line bg-white/95 px-5 py-4 backdrop-blur">
        {item.error && <p className="mb-3 rounded-xl bg-low px-3 py-2 text-sm text-low-ink">{item.error}</p>}
        {blockers.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm text-mid-ink">
            {blockers.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <AlertIcon className="mt-0.5 shrink-0" /> {b}
              </li>
            ))}
          </ul>
        )}
        {duplicate && (
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendAnyway} onChange={(e) => setSendAnyway(e.target.checked)} className="h-4 w-4 accent-ink" />
            Send it anyway (it will be a second chart for that day)
          </label>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => onChange({ checked: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
            />
            <span>
              <span className="font-semibold">I checked the student, date and every rating against the paper chart.</span>
              <span className="block text-ink-soft">Editing anything above clears this box.</span>
            </span>
          </label>
          <button
            onClick={onSend}
            disabled={!canSend}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#2b3a5c] disabled:cursor-not-allowed disabled:bg-muted"
          >
            {item.status === "sending" ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Sending…
              </>
            ) : (
              "Send to Google Sheet"
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

function Reading({ item }: { item: Item }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        <div>
          <h2 className="font-display text-lg font-semibold">{item.status === "preparing" ? "Preparing the photo…" : "Reading the chart…"}</h2>
          <p className="text-sm text-ink-soft">Finding the goals, periods, circled ratings and handwritten notes. About 15 seconds.</p>
        </div>
      </div>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {item.photoUrl ? <PhotoViewer src={item.photoUrl} /> : <div className="h-[380px] rounded-xl shimmer" />}
        <div className="grid content-start gap-3">
          <div className="h-10 rounded-xl shimmer" />
          <div className="h-24 rounded-2xl shimmer" />
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="h-10 rounded-lg shimmer" style={{ animationDelay: `${(i % 6) * 80}ms` }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Failed({ item, onRetry, onDiscard }: { item: Item; onRetry: () => void; onDiscard: () => void }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-low text-xl text-low-ink">
          <AlertIcon />
        </span>
        <div className="flex-1">
          <h2 className="font-display text-lg font-semibold">That one didn&apos;t work</h2>
          <p className="mt-1 text-sm text-ink-soft">{item.error}</p>
          <div className="mt-4 flex gap-2">
            {item.photoUrl && (
              <button onClick={onRetry} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
                Try again
              </button>
            )}
            <button onClick={onDiscard} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">
              Remove
            </button>
          </div>
        </div>
      </div>
      {item.photoUrl && (
        <div className="mt-5">
          <PhotoViewer src={item.photoUrl} />
        </div>
      )}
    </section>
  );
}

function Sent({ item }: { item: Item }) {
  const chart = item.draft!;
  const pct = percent(summarize(chart).daily);
  return (
    <section className="grid min-h-[420px] place-items-center rounded-2xl border border-line bg-white p-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-high text-2xl text-high-ink">
          <CheckIcon />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Sent to your sheet</h2>
        <p className="mt-1 text-ink-soft">
          {chart.student} ·{" "}
          {new Date(`${chart.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {pct !== null && ` · ${Math.round(pct * 100)}%`}
        </p>
        <p className="mt-1 text-xs text-muted">The photo has been cleared from this page.</p>
        {item.sent && (
          <a
            href={item.sent.tabUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent"
          >
            Open {item.sent.tabTitle}&apos;s tab <ExternalIcon />
          </a>
        )}
      </div>
    </section>
  );
}
