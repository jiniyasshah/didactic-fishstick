import type { Metadata } from "next";
import "./globals.css";
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';
import '@fontsource-variable/montserrat';
import '@fontsource-variable/montserrat/wght-italic.css';

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
