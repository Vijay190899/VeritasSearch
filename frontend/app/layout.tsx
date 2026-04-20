import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeritasSearch — Evidence-First Search Engine",
  description:
    "Multi-source consensus verification powered by local AI. Every answer includes a provenance score and auditable evidence chain.",
  keywords: ["fact-checking", "provenance", "RAG", "AI", "search"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
