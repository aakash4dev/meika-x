import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import MotionRoot from "@/components/MotionRoot";
import Rail from "@/components/Rail";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-plex-mono", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--f-space", display: "swap" });

export const metadata: Metadata = {
  title: "MEIKA-X · Earth System Trend Detective",
  description:
    "Every trend gets a trial before it gets a headline. Multi-agent, evidence-first detection of long-term change in NASA Earth data. Team Zentox, NASA Space Apps 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[inter, plexMono, space].map((f) => f.variable).join(" ")}>
      <body>
        <Rail />
        <MotionRoot />
        <div className="main">{children}</div>
      </body>
    </html>
  );
}
