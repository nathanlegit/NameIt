import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canSaveReviews, loadBundle, loadIndex } from "@/src/web/loadBundle";
import { ReviewApp } from "./ReviewApp";

export async function generateStaticParams() {
  return (await loadIndex()).map((video) => ({ videoId: video.id }));
}

type Params = { params: Promise<{ videoId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const bundle = await loadBundle((await params).videoId);
  return { title: bundle ? `Review: ${bundle.title}` : "Video not found" };
}

export default async function ReviewPage({ params }: Params) {
  const bundle = await loadBundle((await params).videoId);
  if (!bundle) notFound();
  return <ReviewApp bundle={bundle} canSave={canSaveReviews()} />;
}
