import type { Metadata } from "next";
import { Space_Grotesk, Archivo_Black, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
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

