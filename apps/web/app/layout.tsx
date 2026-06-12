import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Météo",
  description: "Plateforme agentique météo · Ollama · NATS · OpenTelemetry",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="container mx-auto max-w-4xl px-4 h-12 flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">POC Agent Météo</span>
            <NavLinks />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
