"use client";

import { useEffect, useState } from "react";
import { google, type DriveSheet } from "@/lib/sheets/google";
import { createWorkbook, loadWorkbook, type Workbook } from "@/lib/sheets/workbook";
import { ArrowRightIcon, SheetIcon } from "./icons";

export type WorkbookChoice = { id: string; title: string; url: string };

function schoolYear(d = new Date()) {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String(y + 1).slice(2)}`;
}

export function WorkbookPicker({
  token,
  busy,
  onChoose,
  onGoogleError,
}: {
  token: string;
  busy: boolean;
  onChoose: (wb: Workbook) => void;
  onGoogleError: (err: unknown) => void;
}) {
  const [existing, setExisting] = useState<DriveSheet[] | null>(null);
  const [title, setTitle] = useState(`Behavior Charts ${schoolYear()}`);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    google
      .listWorkbooks(token)
      .then((files) => live && setExisting(files))
      .catch((err) => {
        onGoogleError(err);
        if (live) setExisting([]);
      });
    return () => {
      live = false;
    };
  }, [token, onGoogleError]);

  async function open(id: string) {
    setWorking(id);
    setError(null);
    try {
      const wb = await loadWorkbook(token, id);
      onChoose(wb);
    } catch (err) {
      onGoogleError(err);
      setError((err as Error).message);
      setWorking(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setWorking("new");
    setError(null);
    try {
      const id = await createWorkbook(token, title.trim() || `Behavior Charts ${schoolYear()}`);
      await open(id);
    } catch (err) {
      onGoogleError(err);
      setError((err as Error).message);
      setWorking(null);
    }
  }

  if (busy) {
    return <div className="mx-auto mt-16 h-40 max-w-xl rounded-2xl shimmer" aria-label="Opening your sheet" />;
  }

  return (
    <section className="mx-auto max-w-2xl py-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Where should charts go?</h1>

      <form onSubmit={create} className="mt-6 rounded-2xl border border-line bg-white p-5">
        <label htmlFor="wb-title" className="text-sm font-semibold">
          Start a new sheet
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="wb-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            disabled={!!working}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-semibold text-white hover:bg-[#2b3a5c] disabled:opacity-60"
          >
            {working === "new" ? "Creating…" : "Create sheet"} <ArrowRightIcon />
          </button>
        </div>
      </form>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Or keep using one you made before</h2>
        {existing === null ? (
          <div className="mt-2 h-16 rounded-xl shimmer" />
        ) : existing.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {existing.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => open(f.id)}
                  disabled={!!working}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas disabled:opacity-60"
                >
                  <SheetIcon className="h-5 w-5 text-[#188038]" />
                  <span className="flex-1 truncate font-medium">{f.name}</span>
                  <span className="text-xs text-ink-soft">
                    {working === f.id ? "Opening…" : `edited ${new Date(f.modifiedTime).toLocaleDateString()}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-4 rounded-xl bg-low px-3 py-2 text-sm text-low-ink">{error}</p>}
    </section>
  );
}
