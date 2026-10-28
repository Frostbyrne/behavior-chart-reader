"use client";

import { useState } from "react";
import {
  formatScore,
  ratingTone,
  summarize,
  writtenTotalDisagrees,
  type Cell,
  type ChartReading,
  type ReviewedChart,
} from "@/lib/chart";

type Selection = { kind: "cell"; g: number; p: number } | { kind: "period"; p: number } | { kind: "goal"; g: number } | null;

const toneClass = {
  high: "bg-high text-high-ink",
  mid: "bg-mid text-mid-ink",
  low: "bg-low text-low-ink",
};

export function RatingGrid({
  chart,
  original,
  onChange,
}: {
  chart: ReviewedChart;
  original?: ChartReading;
  onChange: (chart: ReviewedChart) => void;
}) {
  const [sel, setSel] = useState<Selection>(null);
  const sum = summarize(chart);
  const { min, max } = chart.scale;
  const values = Array.from({ length: Math.max(0, max - min) + 1 }, (_, i) => min + i);

  const setCell = (g: number, p: number, patch: Partial<Cell>) => {
    const next = structuredClone(chart);
    next.goals[g].cells[p] = { ...next.goals[g].cells[p], ...patch };
    onChange(next);
  };
  const rate = (g: number, p: number, value: number | null) =>
    setCell(g, p, value === null ? { value: null, state: "blank" } : { value, state: "rated" });

  const setPeriod = (p: number, patch: Partial<ChartReading["periods"][number]>) => {
    const next = structuredClone(chart);
    next.periods[p] = { ...next.periods[p], ...patch };
    onChange(next);
  };
  const setGoal = (g: number, label: string) => {
    const next = structuredClone(chart);
    next.goals[g].label = label;
    onChange(next);
  };
  const removePeriod = (p: number) => {
    const next = structuredClone(chart);
    next.periods.splice(p, 1);
    next.goals.forEach((g) => g.cells.splice(p, 1));
    onChange(next);
    setSel(null);
  };
  const removeGoal = (g: number) => {
    const next = structuredClone(chart);
    next.goals.splice(g, 1);
    onChange(next);
    setSel(null);
  };

  const focusCell = (g: number, p: number) =>
    (document.querySelector(`[data-cell="${g}-${p}"]`) as HTMLButtonElement | null)?.focus();

  function onKey(e: React.KeyboardEvent, g: number, p: number) {
    const G = chart.goals.length;
    const P = chart.periods.length;
    const move: Record<string, [number, number]> = {
      ArrowRight: [g, Math.min(P - 1, p + 1)],
      ArrowLeft: [g, Math.max(0, p - 1)],
      ArrowDown: [Math.min(G - 1, g + 1), p],
      ArrowUp: [Math.max(0, g - 1), p],
    };
    if (move[e.key]) {
      e.preventDefault();
      const [ng, np] = move[e.key];
      setSel({ kind: "cell", g: ng, p: np });
      focusCell(ng, np);
      return;
    }
    const n = Number(e.key);
    if (e.key.length === 1 && Number.isInteger(n) && n >= min && n <= max) {
      e.preventDefault();
      rate(g, p, n);
      // move on, like typing into a spreadsheet
      const np = p + 1 < P ? p + 1 : 0;
      const ng = p + 1 < P ? g : Math.min(G - 1, g + 1);
      setSel({ kind: "cell", g: ng, p: np });
      focusCell(ng, np);
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "-") {
      e.preventDefault();
      rate(g, p, null);
    }
  }

  const wasUnsure = (g: number, p: number) => original?.goals[g]?.cells[p]?.state === "unclear";

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-max border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-40 min-w-40 px-2 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-muted">
                Goal
              </th>
              {chart.periods.map((p, pi) => (
                <th key={pi} className="w-[62px] min-w-[62px] max-w-[84px] align-bottom">
                  <button
                    onClick={() => setSel({ kind: "period", p: pi })}
                    className={`w-full rounded-lg px-1 py-1.5 text-[11px] leading-tight font-semibold transition ${
                      sel?.kind === "period" && sel.p === pi ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-canvas"
                    } ${p.crossedOut ? "text-muted line-through" : ""}`}
                    title={p.note ? `${p.name} — ${p.note}` : p.name}
                  >
                    <span className="line-clamp-3">{p.name || "—"}</span>
                    {p.note && <span className="mt-0.5 line-clamp-2 text-[10px] font-normal italic">{p.note}</span>}
                  </button>
                </th>
              ))}
              <th className="w-16 min-w-16 align-bottom text-[11px] font-semibold uppercase tracking-wider text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            {chart.goals.map((goal, gi) => (
              <tr key={gi}>
                <th className="px-1 text-left font-normal">
                  <button
                    onClick={() => setSel({ kind: "goal", g: gi })}
                    className={`w-full rounded-lg px-2 py-1 text-left text-[13px] leading-snug font-semibold ${
                      sel?.kind === "goal" && sel.g === gi ? "bg-accent-soft text-accent" : "hover:bg-canvas"
                    }`}
                  >
                    {goal.label || "Untitled goal"}
                  </button>
                </th>
                {chart.periods.map((period, pi) => {
                  const c = goal.cells[pi];
                  const active = sel?.kind === "cell" && sel.g === gi && sel.p === pi;
                  const skipped = period.crossedOut;
                  const rated = !skipped && c.state === "rated" && c.value !== null;
                  const unclear = !skipped && (c.state === "unclear" || (c.state === "rated" && c.value === null));
                  return (
                    <td key={pi} className="p-0">
                      <button
                        data-cell={`${gi}-${pi}`}
                        onClick={() => setSel({ kind: "cell", g: gi, p: pi })}
                        onKeyDown={(e) => onKey(e, gi, pi)}
                        aria-label={`${goal.label}, ${period.name}: ${skipped ? "didn't happen" : rated ? c.value : unclear ? "unclear" : "blank"}`}
                        className={`relative grid h-11 w-full place-items-center rounded-lg text-base font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                          skipped
                            ? "bg-skip text-skip-ink"
                            : rated
                              ? toneClass[ratingTone(c.value as number, min, max)]
                              : unclear
                                ? "border-2 border-dashed border-mid-ink/60 bg-mid/40 text-mid-ink"
                                : "border border-dashed border-line bg-white text-muted"
                        } ${active ? "ring-2 ring-accent ring-offset-1" : ""}`}
                      >
                        {skipped ? "—" : rated ? c.value : unclear ? "?" : ""}
                        {c.note && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ink/70" title={c.note} />}
                        {wasUnsure(gi, pi) && rated && (
                          <span className="absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded bg-mid-ink/50" title="You fixed this one" />
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="text-center text-[13px] font-semibold text-ink-soft">{formatScore(sum.byGoal[gi])}</td>
              </tr>
            ))}
            <tr>
              <th className="px-3 pt-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">Period total</th>
              {sum.byPeriod.map((s, pi) => {
                const written = chart.periods[pi].writtenTotal;
                const off = !s.skipped && written && writtenTotalDisagrees(written, s);
                return (
                  <td key={pi} className="pt-2 text-center align-top">
                    <div className="text-[13px] font-semibold">{s.skipped ? "—" : formatScore(s)}</div>
                    {off && (
                      <div className="mt-0.5 rounded bg-low px-1 text-[10px] font-semibold text-low-ink" title="Total written on the paper">
                        paper: {written}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="pt-2 text-center text-[13px] font-bold">{formatScore(sum.daily)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Inspector
        chart={chart}
        sel={sel}
        values={values}
        onRate={rate}
        onNote={(g, p, note) => setCell(g, p, { note })}
        onPeriod={setPeriod}
        onGoal={setGoal}
        onRemovePeriod={removePeriod}
        onRemoveGoal={removeGoal}
        wasUnsure={wasUnsure}
      />
    </div>
  );
}

function Inspector({
  chart,
  sel,
  values,
  onRate,
  onNote,
  onPeriod,
  onGoal,
  onRemovePeriod,
  onRemoveGoal,
  wasUnsure,
}: {
  chart: ReviewedChart;
  sel: Selection;
  values: number[];
  onRate: (g: number, p: number, v: number | null) => void;
  onNote: (g: number, p: number, note: string) => void;
  onPeriod: (p: number, patch: Partial<ChartReading["periods"][number]>) => void;
  onGoal: (g: number, label: string) => void;
  onRemovePeriod: (p: number) => void;
  onRemoveGoal: (g: number) => void;
  wasUnsure: (g: number, p: number) => boolean;
}) {
  const box = "mt-3 rounded-xl border border-line bg-canvas/60 p-3";
  const input =
    "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

  if (!sel)
    return (
      <p className="mt-3 text-xs text-ink-soft">
        Click a rating to change it, or select one and type{" "}
        {values.map((v) => (
          <kbd key={v} className="mx-0.5 rounded border border-line bg-white px-1 font-mono">
            {v}
          </kbd>
        ))}
        , <kbd className="rounded border border-line bg-white px-1 font-mono">⌫</kbd> to clear, arrows to move. Click a period or goal to edit it.
      </p>
    );

  if (sel.kind === "cell") {
    const { g, p } = sel;
    const c = chart.goals[g]?.cells[p];
    if (!c) return null;
    const { min, max } = chart.scale;
    const label = (v: number) => chart.scale.labels.find((l) => l.value === v)?.label;
    return (
      <div className={box}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">{chart.goals[g].label}</span>
          <span className="text-ink-soft">· {chart.periods[p].name}</span>
          {wasUnsure(g, p) && <span className="rounded-full bg-mid px-2 py-0.5 text-[11px] font-semibold text-mid-ink">AI wasn&apos;t sure</span>}
          {chart.periods[p].crossedOut && <span className="text-xs text-ink-soft">This period is marked as didn&apos;t happen.</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {values.map((v) => {
            const on = c.state === "rated" && c.value === v;
            const tone = ratingTone(v, min, max);
            return (
              <button
                key={v}
                onClick={() => onRate(g, p, v)}
                className={`min-w-11 rounded-lg px-3 py-1.5 text-sm font-bold ${toneClass[tone]} ${on ? "ring-2 ring-ink ring-offset-1" : "opacity-80 hover:opacity-100"}`}
                title={label(v)}
              >
                {v}
                {label(v) && <span className="ml-1.5 hidden text-xs font-medium sm:inline">{label(v)}</span>}
              </button>
            );
          })}
          <button
            onClick={() => onRate(g, p, null)}
            className={`rounded-lg border border-dashed px-3 py-1.5 text-sm font-medium ${
              c.state === "blank" ? "border-ink text-ink" : "border-line text-ink-soft hover:border-ink-soft"
            }`}
          >
            Not rated
          </button>
        </div>
        <input
          value={c.note}
          onChange={(e) => onNote(g, p, e.target.value)}
          placeholder="Handwritten note in this box (optional)"
          className={`${input} mt-2`}
        />
      </div>
    );
  }

  if (sel.kind === "period") {
    const period = chart.periods[sel.p];
    if (!period) return null;
    return (
      <div className={`${box} grid gap-2 sm:grid-cols-[1fr_1fr_auto]`}>
        <label className="text-xs font-semibold text-ink-soft">
          Period name
          <input value={period.name} onChange={(e) => onPeriod(sel.p, { name: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-ink-soft">
          Note above this period
          <input value={period.note} onChange={(e) => onPeriod(sel.p, { note: e.target.value })} className={`${input} mt-1`} />
        </label>
        <div className="flex flex-col justify-end gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={period.crossedOut}
              onChange={(e) => onPeriod(sel.p, { crossedOut: e.target.checked })}
              className="h-4 w-4 accent-ink"
            />
            Didn&apos;t happen (crossed out)
          </label>
          <button onClick={() => onRemovePeriod(sel.p)} className="text-left text-xs font-medium text-low-ink hover:underline">
            Remove this column
          </button>
        </div>
      </div>
    );
  }

  const goal = chart.goals[sel.g];
  if (!goal) return null;
  return (
    <div className={`${box} flex flex-wrap items-end gap-3`}>
      <label className="min-w-64 flex-1 text-xs font-semibold text-ink-soft">
        Goal
        <input value={goal.label} onChange={(e) => onGoal(sel.g, e.target.value)} className={`${input} mt-1`} />
      </label>
      <button onClick={() => onRemoveGoal(sel.g)} className="pb-2 text-xs font-medium text-low-ink hover:underline">
        Remove this row
      </button>
    </div>
  );
}
