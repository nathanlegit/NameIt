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
    <section>
      <div className="watch-top">
        <h1 className="page-title">{bundle.title}</h1>
        <span className="credit">
          {/* Scripted clips' attribution already says "narration ElevenLabs". */}
          {bundle.syntheticNarration ? bundle.attribution : `Original narration. ${bundle.attribution}`}
        </span>
      </div>
      <Player bundle={bundle} />
    </section>
  );
}
