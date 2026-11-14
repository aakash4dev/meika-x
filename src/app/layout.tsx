import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Inter, Manrope, Space_Grotesk } from "next/font/google";
import ThemePicker from "@/components/ThemePicker";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/themes";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-plex-mono", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-fraunces", display: "swap", style: ["normal", "italic"] });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--f-space", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--f-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "MEIKA-X · Earth System Trend Detective",
  description:
    "Every trend gets a trial before it gets a headline. Multi-agent, evidence-first detection of change in NASA Earth data. Team Zentox, NASA Space Apps 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = [inter, plexSans, plexMono, fraunces, space, manrope].map((f) => f.variable).join(" ");
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className={fonts} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            MEIKA-X <small>Earth System Trend Detective</small>
          </Link>
          <Link href="/" className="link">Cases</Link>
          <Link href="/monitor" className="link">Monitoring</Link>
          <Link href="/reports" className="link">Reports</Link>
          <Link href="/system" className="link">Agents &amp; system</Link>
          <span className="spacer" />
          <ThemePicker />
          <span className="tiny muted">Team Zentox · NASA Space Apps 2026</span>
        </nav>
        {children}
        <footer className="footer">
          Data: NASA POWER (MERRA-2, CERES), NASA EONET, NASA GIBS, NASA CMR{process.env.FIRMS_MAP_KEY ? ", NASA FIRMS" : ""}. Advisory analysis for
          education, not an official warning. NASA does not endorse this project.
        </footer>
      </body>
    </html>
  );
}
