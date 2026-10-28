import { NoObjectGeneratedError } from "ai";
import { AuthError, requireUser } from "@/lib/server/google-auth";
import { readChart } from "@/lib/server/read-chart";

/**
 * POST a chart photo, get back the AI's reading. The photo lives only in this
 * request's memory: it is not written to disk, a database, blob storage or
 * the logs, and AI Gateway is told to use zero-data-retention providers only.
 * Errors are logged by kind, never with chart content.
 */

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Per-instance brake on runaway use; the real limit is the project's AI Gateway budget.
const recent = new Map<string, number[]>();
const PER_HOUR = Number(process.env.READS_PER_HOUR_PER_USER ?? 120);

function overLimit(email: string): boolean {
  const now = Date.now();
  const times = (recent.get(email) ?? []).filter((t) => now - t < 3_600_000);
  times.push(now);
  recent.set(email, times);
  return times.length > PER_HOUR;
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let email: string;
  try {
    ({ email } = await requireUser(request));
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    console.error("auth check failed:", (err as Error).name);
    return fail("Couldn't check your sign-in. Try again.", 502);
  }
  if (overLimit(email)) return fail("That's a lot of charts in an hour. Try again later.", 429);

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("photo");
    file = value instanceof File ? value : null;
  } catch {
    return fail("Send the photo as form data.", 400);
  }
  if (!file) return fail("No photo was attached.", 400);
  if (!TYPES.has(file.type)) return fail("Use a JPEG, PNG or WebP photo.", 415);
  if (file.size > MAX_BYTES) return fail("That photo is too large (4 MB limit).", 413);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { reading, model } = await readChart(bytes, file.type, request.signal);
    return Response.json({ reading, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (request.signal.aborted) return fail("Cancelled.", 499);
    if (NoObjectGeneratedError.isInstance(err)) {
      console.error("read failed: model returned no chart");
      return fail("The AI couldn't read a chart in that photo. Try a clearer, flatter photo.", 422);
    }
    const status = (err as { statusCode?: number }).statusCode;
    console.error("read failed:", (err as Error).name, status ?? "");
    if (status === 429) return fail("The AI service is busy. Try again in a minute.", 503);
    if (status === 402) return fail("This tool is out of AI credits. Let whoever runs it know.", 503);
    return fail("The AI service couldn't read that photo. Try again.", 502);
  }
}
