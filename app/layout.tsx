import type { Metadata } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "./components/SiteNav";
import "./globals.css";

// Self-hosted by next/font at build time: viewers' browsers never call Google.
// Atkinson Hyperlegible was designed by the Braille Institute for low-vision readers.
const display = Schibsted_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Name It", template: "%s · Name It" },
  description: "Name It resolves “this”, “that” and “like this” in how-to videos for blind and low-vision viewers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="inner">
            <Link href="/" className="brand">
              <span className="mark" aria-hidden="true" />
              <span className="name">Name It</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
          <p>
            Built during the Meta Global AI Developer Hackathon with Muse Spark, SAM 3.1 and Muse Voice Transcribe. Footage credits are in
            the repository&apos;s CREDITS.md. Narration on the scripted clips is synthetic (ElevenLabs).
          </p>
        </footer>
      </body>
    </html>
  );
}
