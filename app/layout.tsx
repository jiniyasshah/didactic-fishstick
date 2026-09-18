import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verse — Caption & Lyric Studio",
  description: "Shape every word. A creative studio for video captions and lyrics.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
