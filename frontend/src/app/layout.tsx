import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HackHub | Ultimate Hackathon Collaboration Platform",
  description: "Collab workspace with real-time chat, shared Monaco code editor, whiteboard, taskboards, and AI Hackathon Copilot.",
  keywords: ["hackathon", "collaboration", "coding", "live editor", "whiteboard", "kanban", "AI copilot", "pair programming"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} ${poppins.variable} min-h-full flex flex-col antialiased bg-[#090d16] text-slate-100`}>
        {children}
      </body>
    </html>
  );
}
