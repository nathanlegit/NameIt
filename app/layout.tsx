import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Name It", template: "%s · Name It" },
  description: "Name It resolves “this”, “that” and “like this” in how-to videos for blind and low-vision viewers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand">Name It</Link>
          <nav aria-label="Main">
            <ul>
              <li><Link href="/">Videos</Link></li>
              <li><Link href="/eval">Evaluation</Link></li>
            </ul>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
          <p>
            Built during the Meta Global AI Developer Hackathon with Muse Spark, SAM 3.1 and Muse Voice Transcribe.
            Footage credits are in the repository&apos;s CREDITS.md. Narration on the scripted clips is synthetic (ElevenLabs).
          </p>
        </footer>
      </body>
    </html>
  );
}
