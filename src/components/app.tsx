"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartReading, ReviewedChart } from "@/lib/chart";
import { signIn, signOut, type Session } from "@/lib/client/google-identity";
import { preparePhoto } from "@/lib/client/photo";
import { matchStudent } from "@/lib/client/students";
import { GoogleApiError } from "@/lib/sheets/google";
import { dateSerial } from "@/lib/sheets/style";
import { knownStudents, loadWorkbook, sendChart, type Workbook } from "@/lib/sheets/workbook";
import { ChartList } from "./chart-list";
import { Mark } from "./icons";
import { ReviewPanel } from "./review-panel";
import { SignedOut } from "./signed-out";
import { WorkbookPicker, type WorkbookChoice } from "./workbook-picker";

export type Item = {
  id: string;
  fileName: string;
  photoUrl: string | null;
  status: "preparing" | "reading" | "review" | "sending" | "sent" | "error";
  error?: string;
  /** What the AI read, kept to show which cells it was unsure about. */
  original?: ChartReading;
  draft?: ReviewedChart;
  reviewNotes: string;
  checked: boolean;
  sent?: { tabUrl: string; tabTitle: string };
};

const SAVED_WORKBOOK = "bcr.workbook";
const READ_AT_ONCE = 3;

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(SAVED_WORKBOOK, id);
    else localStorage.removeItem(SAVED_WORKBOOK);
  } catch {}
}

function remembered(): string | null {
  try {
    return localStorage.getItem(SAVED_WORKBOOK);
  } catch {
    return null;
  }
}

export function App({ clientId }: { clientId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookChoice | null>(null);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [students, setStudents] = useState<string[]>([]);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const blobs = useRef(new Map<string, Blob>());
  const reading = useRef(0);
  const waiting = useRef<string[]>([]);
  const sessionRef = useRef(session);
  const studentsRef = useRef(students);
  useEffect(() => {
    sessionRef.current = session;
    studentsRef.current = students;
  }, [session, students]);

  const update = useCallback((id: string, patch: Partial<Item> | ((i: Item) => Partial<Item>)) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...(typeof patch === "function" ? patch(i) : patch) } : i)));
  }, []);

  // Session expiry: Google access tokens last about an hour.
  useEffect(() => {
    if (!session) return;
    const ms = session.expiresAt - Date.now() - 60_000;
    const t = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [session]);

  const handleGoogleError = useCallback((err: unknown) => {
    if (err instanceof GoogleApiError && err.status === 401) setExpired(true);
  }, []);

  async function doSignIn() {
    setAuthError(null);
    try {
      const s = await signIn(clientId, session?.email);
      setSession(s);
      setExpired(false);
      const saved = remembered();
      if (saved && !workbook) {
        setCheckingSaved(true);
        try {
          openWorkbook(await loadWorkbook(s.token, saved));
        } catch {
          remember(null);
        } finally {
          setCheckingSaved(false);
        }
      }
    } catch (err) {
      setAuthError((err as Error).message);
    }
  }

  function doSignOut() {
    signOut(session);
    for (const i of items) if (i.photoUrl) URL.revokeObjectURL(i.photoUrl);
    blobs.current.clear();
    setItems([]);
    setSelected(null);
    setSession(null);
    setWorkbook(null);
    setStudents([]);
  }

  function openWorkbook(wb: Workbook) {
    remember(wb.id);
    setWorkbook({ id: wb.id, title: wb.title, url: wb.url });
    setStudents(knownStudents(wb));
    setLogged(wb.logged);
  }

  const logKey = (student: string, date: string) => `${Math.floor(dateSerial(date))}|${student.trim().toLowerCase()}`;
  const isLogged = (student: string, date: string) => !!date && !!student.trim() && logged.has(logKey(student, date));

  function changeWorkbook() {
    remember(null);
    setWorkbook(null);
  }

  const pump = useCallback(function next() {
    const session = sessionRef.current;
    while (reading.current < READ_AT_ONCE && waiting.current.length) {
      const id = waiting.current.shift()!;
      const blob = blobs.current.get(id);
      if (!blob || !session) continue;
      reading.current++;
      update(id, { status: "reading", error: undefined });
      const form = new FormData();
      form.append("photo", blob, "chart.jpg");
      fetch("/api/read", { method: "POST", body: form, headers: { Authorization: `Bearer ${session.token}` } })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (res.status === 401) setExpired(true);
          if (!res.ok) throw new Error(body.error || "Couldn't read that photo.");
          const reading = body.reading as ChartReading;
          const match = matchStudent(reading.studentName, studentsRef.current);
          update(id, {
            status: "review",
            original: reading,
            draft: { ...reading, student: match.kind === "new" ? reading.studentName : match.name },
          });
          setSelected((cur) => cur ?? id);
        })
        .catch((err: Error) => update(id, { status: "error", error: err.message }))
        .finally(() => {
          reading.current--;
          next();
        });
    }
  }, [update]);

  async function addPhotos(files: File[]) {
    // Jump to the new photo unless a chart is already waiting for review.
    const showing = items.find((i) => i.id === selected);
    let jump = !showing || showing.status === "sent" || showing.status === "error";
    for (const file of files) {
      const id = crypto.randomUUID();
      setItems((all) => [...all, { id, fileName: file.name, photoUrl: null, status: "preparing", reviewNotes: "", checked: false }]);
      if (jump) setSelected(id);
      jump = false;
      try {
        const blob = await preparePhoto(file);
        blobs.current.set(id, blob);
        update(id, { photoUrl: URL.createObjectURL(blob) });
        waiting.current.push(id);
        pump();
      } catch (err) {
        update(id, { status: "error", error: (err as Error).message });
      }
    }
  }

  function retry(id: string) {
    if (!blobs.current.has(id)) return;
    waiting.current.push(id);
    update(id, { status: "reading", error: undefined });
    pump();
  }

  function discard(id: string) {
    const item = items.find((i) => i.id === id);
    if (item?.photoUrl) URL.revokeObjectURL(item.photoUrl);
    blobs.current.delete(id);
    const rest = items.filter((i) => i.id !== id);
    setItems(rest);
    if (selected === id) setSelected(rest.find((i) => i.status === "review")?.id ?? rest[0]?.id ?? null);
  }

  async function send(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item?.draft || !session || !workbook) return;
    update(id, { status: "sending", error: undefined });
    try {
      const result = await sendChart(session.token, workbook.id, item.draft, {
        addedBy: session.email,
        reviewNotes: item.reviewNotes,
      });
      // Done with the photo: drop it from memory.
      if (item.photoUrl) URL.revokeObjectURL(item.photoUrl);
      blobs.current.delete(id);
      update(id, { status: "sent", sent: result, photoUrl: null });
      const name = item.draft.student.trim();
      setLogged((all) => new Set(all).add(logKey(name, item.draft!.date)));
      setStudents((all) =>
        all.some((n) => n.toLowerCase() === name.toLowerCase()) ? all : [...all, name].sort((a, b) => a.localeCompare(b)),
      );
      const next = items.find((i) => i.id !== id && i.status === "review");
      if (next) setSelected(next.id);
    } catch (err) {
      handleGoogleError(err);
      update(id, { status: "review", error: `Couldn't send to the sheet: ${(err as Error).message}` });
    }
  }

  const current = items.find((i) => i.id === selected) ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      {session && (
        <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
            <Mark className="h-8 w-8 shrink-0" />
            <div className="min-w-0 font-display text-[17px] font-semibold leading-tight tracking-tight">Behavior Chart Reader</div>
            <div className="ml-auto flex items-center gap-2">
              {workbook && (
                <a
                  href={workbook.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden max-w-[260px] items-center gap-2 truncate rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent md:flex"
                  title="Open your sheet"
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#34a86b]" />
                  <span className="truncate">{workbook.title}</span>
                </a>
              )}
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-white p-1 pr-3 text-sm hover:border-ink-soft">
                  {session.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {session.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="hidden max-w-[160px] truncate sm:inline">{session.name.split(" ")[0]}</span>
                </summary>
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white p-2 text-sm shadow-lg">
                  <div className="px-2 py-1.5 text-ink-soft">{session.email}</div>
                  {workbook && (
                    <button onClick={changeWorkbook} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
                      Use a different sheet
                    </button>
                  )}
                  <button onClick={doSignOut} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
                    Sign out
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
      )}

      {expired && session && (
        <div className="border-b border-mid-ink/20 bg-mid px-4 py-2 text-center text-sm text-mid-ink">
          Your Google sign-in timed out. Charts you&apos;re reviewing are still here.{" "}
          <button onClick={doSignIn} className="font-semibold underline underline-offset-2">
            Continue as {session.email}
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">
        {!clientId ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white p-6 text-sm">
            <b>Setup needed:</b> set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to the Google OAuth web client ID and redeploy.
          </div>
        ) : !session ? (
          <SignedOut onSignIn={doSignIn} error={authError} />
        ) : !workbook ? (
          <WorkbookPicker
            token={session.token}
            busy={checkingSaved}
            onChoose={openWorkbook}
            onGoogleError={handleGoogleError}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <ChartList items={items} selected={selected} onSelect={setSelected} onAdd={addPhotos} onRetry={retry} />
            {current ? (
              <ReviewPanel
                key={current.id}
                item={current}
                students={students}
                isLogged={isLogged}
                onChange={(patch) => update(current.id, patch)}
                onSend={() => send(current.id)}
                onDiscard={() => discard(current.id)}
                onRetry={() => retry(current.id)}
              />
            ) : (
              <EmptyReview />
            )}
          </div>
        )}
      </main>

    </div>
  );
}

function EmptyReview() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-line bg-white/60 p-10 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 grid-cols-3 gap-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-line">
          {["bg-high", "bg-high", "bg-mid", "bg-high", "bg-low", "bg-high", "bg-high", "bg-high", "bg-high"].map((c, i) => (
            <span key={i} className={`rounded-[3px] ${c}`} />
          ))}
        </div>
        <h2 className="font-display text-lg font-semibold">Add today&apos;s charts</h2>
      </div>
    </section>
  );
}
