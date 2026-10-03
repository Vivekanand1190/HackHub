import type { Metadata } from "next";
import { Space_Grotesk, Archivo_Black, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

// Transitional shim: the feature components still call the API on the hardcoded
// dev host. When NEXT_PUBLIC_API_URL is set, transparently rewrite those calls
// so a deployed frontend reaches the deployed backend. This can be replaced by
// importing NEXT_PUBLIC_API_URL directly in each component.
const rawApiBase = process.env.NEXT_PUBLIC_API_URL || "";
let apiBase = rawApiBase;
while (apiBase.endsWith("/")) apiBase = apiBase.slice(0, -1);

const apiShim = apiBase
  ? "(function(){var O='http://localhost:8888',N=" +
    JSON.stringify(apiBase) +
    ";if(!N||N===O)return;function r(u){return typeof u==='string'&&u.indexOf(O)===0?N+u.slice(O.length):u}" +
    "var f=window.fetch;window.fetch=function(i,init){return f.call(this,typeof i==='string'?r(i):i,init)};" +
    "var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=r(u);return o.apply(this,a)};})();"
  : "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${spaceGrotesk.variable} ${archivoBlack.variable} ${jetbrainsMono.variable} min-h-full flex flex-col antialiased bg-[#0b0b0f] text-[#f5f1e6]`}
      >
        {apiShim ? <script dangerouslySetInnerHTML={{ __html: apiShim }} /> : null}
        {children}
      </body>
    </html>
  );
}
