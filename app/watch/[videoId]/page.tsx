import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBundle, loadIndex } from "@/src/web/loadBundle";
import { Player } from "./Player";

export async function generateStaticParams() {
  return (await loadIndex()).map((video) => ({ videoId: video.id }));
}

type Params = { params: Promise<{ videoId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const bundle = await loadBundle((await params).videoId);
  return { title: bundle ? `Watch: ${bundle.title}` : "Video not found" };
}

export default async function WatchPage({ params }: Params) {
  const bundle = await loadBundle((await params).videoId);
  if (!bundle) notFound();
  return (
    <>
      <h1>{bundle.title}</h1>
      <p className="lede">
        With audio description of what the presenter points at.{" "}
        {bundle.syntheticNarration ? "The presenter's narration in this clip is synthetic (ElevenLabs). " : ""}
        {bundle.attribution}
      </p>
      <Player bundle={bundle} />
    </>
  );
}
