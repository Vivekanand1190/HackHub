import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Self-hosted fonts.
//
// These used to be stub objects — `{ variable: "--font-space-grotesk" }` — whose
// "class name" was the CSS variable name itself. No webfont was ever loaded, so
// every heading silently fell back to Impact and the body text to the system UI
// font, while the README claimed the fonts were self-hosted.
//
// next/font/local resolves the files at build time, fingerprints them, serves
// them from our own origin, and exposes each family as a CSS variable that
// globals.css consumes. No runtime request leaves the host.
const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2",
  variable: "--font-space-grotesk",
  weight: "400 700",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

const archivoBlack = localFont({
  src: "./fonts/ArchivoBlack-Regular.woff2",
  variable: "--font-archivo-black",
  weight: "400",
  display: "swap",
  fallback: ["impact", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 700",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "HackHub | Ultimate Hackathon Collaboration Platform",
  description:
    "Collab workspace with real-time chat, shared Monaco code editor, whiteboard, taskboards, and AI Hackathon Copilot.",
  manifest: "/manifest.json",
  themeColor: "#ffe500",
  keywords: [
    "hackathon",
    "collaboration",
    "coding",
    "live editor",
    "whiteboard",
    "kanban",
    "AI copilot",
    "pair programming",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffe500" />
      </head>
      <body
        suppressHydrationWarning
        className={`${spaceGrotesk.variable} ${archivoBlack.variable} ${jetbrainsMono.variable} min-h-full flex flex-col antialiased bg-[#0b0b0f] text-[#f5f1e6]`}
      >
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
