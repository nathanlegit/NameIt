// Saves a reviewer's decisions (local runs only).
//   data/videos/<id>/review.json    the ReviewState (decisions + edit log)
//   data/videos/<id>/edits.json     the edit log on its own (PRD F10)
//   public/demo/<id>/bundle.json    updated too, so a reload shows the decisions
// On Vercel the filesystem is read-only, so this returns 403 and the browser keeps them.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { writeJson } from "@/src/lib/cache";
import { isValidVideoId } from "@/src/lib/videoId";
import { videoPaths } from "@/src/pipeline/store";
import type { VideoBundle } from "@/src/web/bundle";
import { canSaveReviews } from "@/src/web/loadBundle";

const ReviewStateSchema = z.object({
  decisions: z.record(
    z.string(),
    z.object({ status: z.enum(["approved", "edited", "rejected"]), finalText: z.string().max(400).nullable(), at: z.string() }),
  ),
  edits: z.array(z.object({ cueId: z.string(), before: z.string(), after: z.string(), at: z.string() })),
  publishedAt: z.string().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  if (!canSaveReviews()) {
    return Response.json({ error: "Demo mode: reviews are kept in your browser." }, { status: 403 });
  }
  const { videoId } = await params;
  if (!isValidVideoId(videoId)) return Response.json({ error: "Bad video id" }, { status: 400 });
  const paths = videoPaths(videoId);
  if (!existsSync(paths.meta)) return Response.json({ error: "No such video" }, { status: 404 });

  const parsed = ReviewStateSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const review = parsed.data;
  await writeJson(paths.review, review);
  await writeJson(paths.edits, review.edits);

  const bundlePath = path.join(process.cwd(), "public", "demo", videoId, "bundle.json");
  if (existsSync(bundlePath)) {
    const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as VideoBundle;
    await writeJson(bundlePath, { ...bundle, review });
  }
  return Response.json({ ok: true });
}
