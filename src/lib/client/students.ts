/** Matching the name the AI read off a chart to a student already in the sheet. */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type NameMatch =
  | { kind: "exact"; name: string }
  | { kind: "close"; name: string }
  | { kind: "new" };

export function matchStudent(read: string, known: string[]): NameMatch {
  const r = norm(read);
  if (!r) return { kind: "new" };
  const exact = known.find((k) => norm(k) === r);
  if (exact) return { kind: "exact", name: exact };

  const words = r.split(" ");
  const close = known.filter((k) => {
    const kw = norm(k).split(" ");
    if (!kw[0] || !words[0]) return false;
    const sameFirst = kw[0] === words[0];
    const lastR = words.at(-1) ?? "";
    const lastK = kw.at(-1) ?? "";
    // "Jordan R." ↔ "Jordan Rivera", "J Rivera" ↔ "Jordan Rivera", "Jordan" ↔ "Jordan Rivera"
    const initialFits = (a: string, b: string) => a.length === 1 && b.startsWith(a);
    return (
      (sameFirst && (words.length === 1 || kw.length === 1 || lastR === lastK || initialFits(lastR, lastK) || initialFits(lastK, lastR))) ||
      (lastR === lastK && lastR.length > 1 && (initialFits(words[0], kw[0]) || initialFits(kw[0], words[0])))
    );
  });
  return close.length === 1 ? { kind: "close", name: close[0] } : { kind: "new" };
}
