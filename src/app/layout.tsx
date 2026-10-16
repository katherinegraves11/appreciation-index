import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "The Appreciation Index",
  description: "Which luxury pieces hold their value, and which to buy to wear.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">The Appreciation Index</Link>
          <div className="links">
            <Link href="/">Ask</Link>
            <Link href="/briefs">Past answers</Link>
            <Link href="/classic">Analyst form</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
