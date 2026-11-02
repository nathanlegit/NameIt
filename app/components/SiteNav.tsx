"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Videos", matches: (path: string) => path === "/" || path.startsWith("/review") || path.startsWith("/watch") },
  { href: "/eval", label: "Evaluation", matches: (path: string) => path.startsWith("/eval") },
];

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="site-nav">
      <ul>
        {TABS.map((tab) => (
          <li key={tab.href}>
            <Link href={tab.href} aria-current={tab.matches(pathname) ? "page" : undefined}>{tab.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
