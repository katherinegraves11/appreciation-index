import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "The Bag Index",
  description: "Value-retention briefs for luxury handbags, sourced and scored.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">The Bag Index</Link>
          <div className="links">
            <Link href="/">New brief</Link>
            <Link href="/briefs">Past briefs</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
