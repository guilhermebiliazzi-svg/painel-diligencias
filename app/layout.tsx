import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Painel de Diligências — RE/MAX Ville",
  description: "Acompanhamento de diligência imobiliária",
};

export const viewport = {
  colorScheme: "light" as const,
  themeColor: "#f8fafc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ colorScheme: "light", backgroundColor: "#f8fafc" }}
    >
      <head>
        <meta name="color-scheme" content="light only" />
      </head>
      <body
        style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}
        className="min-h-screen antialiased"
      >
        {children}
      </body>
    </html>
  );
}