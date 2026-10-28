"use client";

import { useRef, useState } from "react";
import { percent, summarize } from "@/lib/chart";
import type { Item } from "./app";
import { AlertIcon, CameraIcon, CheckIcon, UploadIcon } from "./icons";

export function ChartList({
  items,
  selected,
  onSelect,
  onAdd,
  onRetry,
}: {
  items: Item[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: (files: File[]) => void;
  onRetry: (id: string) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name));
    if (picked.length) onAdd(picked);
  };

  const toReview = items.filter((i) => i.status === "review").length;
  const sent = items.filter((i) => i.status === "sent").length;

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-22 lg:max-h-[calc(100vh-7rem)]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${over ? "border-accent bg-accent-soft" : "border-line bg-white"}`}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => camera.current?.click()}
            className="flex flex-col items-center gap-1 rounded-xl bg-ink px-3 py-3 text-sm font-semibold text-white hover:bg-[#2b3a5c]"
          >
            <CameraIcon className="text-xl" /> Take photo
          </button>
          <button
            onClick={() => files.current?.click()}
            className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white px-3 py-3 text-sm font-semibold hover:border-ink-soft"
          >
            <UploadIcon className="text-xl" /> Upload
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">or drop photos here</p>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (take(e.target.files), (e.target.value = ""))} />
        <input ref={files} type="file" accept="image/*" multiple hidden onChange={(e) => (take(e.target.files), (e.target.value = ""))} />
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs font-medium text-ink-soft">
          <span>{toReview ? `${toReview} to check` : "All checked"}</span>
          <span>{sent ? `${sent} sent` : ""}</span>
        </div>
      )}

      <ul className="flex flex-col gap-2 overflow-y-auto pb-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                item.id === selected ? "border-accent bg-white shadow-sm ring-2 ring-accent/15" : "border-line bg-white hover:border-ink-soft/40"
              }`}
            >
              <Thumb item={item} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.draft?.student || item.fileName || "Chart"}</div>
                <div className="truncate text-xs text-ink-soft">{subtitle(item)}</div>
              </div>
              <Status item={item} onRetry={() => onRetry(item.id)} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function subtitle(item: Item): string {
  if (item.status === "preparing") return "Preparing photo…";
  if (item.status === "reading") return "Reading the chart…";
  if (item.status === "error") return item.error ?? "Something went wrong";
  const d = item.draft;
  if (!d) return "";
  const p = percent(summarize(d).daily);
  const date = d.date
    ? new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "No date yet";
  return `${date}${p === null ? "" : ` · ${Math.round(p * 100)}%`}`;
}

function Thumb({ item }: { item: Item }) {
  if (item.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-line" />;
  return (
    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${item.status === "sent" ? "bg-high text-high-ink" : "shimmer"}`}>
      {item.status === "sent" && <CheckIcon className="text-xl" />}
    </div>
  );
}

function Status({ item, onRetry }: { item: Item; onRetry: () => void }) {
  switch (item.status) {
    case "preparing":
    case "reading":
    case "sending":
      return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Working" />;
    case "review":
      return <span className="shrink-0 rounded-full bg-mid px-2 py-0.5 text-[11px] font-semibold text-mid-ink">Check</span>;
    case "sent":
      return <span className="shrink-0 rounded-full bg-high px-2 py-0.5 text-[11px] font-semibold text-high-ink">Sent</span>;
    case "error":
      return (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => (e.stopPropagation(), onRetry())}
          onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), onRetry())}
          className="flex shrink-0 items-center gap-1 rounded-full bg-low px-2 py-0.5 text-[11px] font-semibold text-low-ink"
        >
          <AlertIcon /> Retry
        </span>
      );
  }
}
