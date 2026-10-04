import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const spaceGrotesk = { variable: "--font-space-grotesk" };
const archivoBlack = { variable: "--font-archivo-black" };
const jetbrainsMono = { variable: "--font-jetbrains-mono" };

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

