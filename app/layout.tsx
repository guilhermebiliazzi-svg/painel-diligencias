import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import BarraProgresso from "./_components/BarraProgresso";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel de Diligências — REMAX Ville",
  description: "Acompanhamento de diligência imobiliária",
  // Nome que aparece embaixo do ícone quando o app é aberto em tela cheia no iOS.
  appleWebApp: {
    capable: true,
    title: "REMAX Ville",
    statusBarStyle: "default",
  },
};

export const viewport = {
  colorScheme: "light" as const,
  themeColor: "#ffffff",
};

// 09/11: mesmo padrão visual do site (villejardins.com.br): Montserrat, logo REMAX Ville no topo,
// fundo areia e títulos em azul-marinho. As cores ficam em globals.css.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      style={{ colorScheme: "light", backgroundColor: "#F7F5EE" }}
    >
      <head>
        <meta name="color-scheme" content="light only" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" />
      </head>
      <body
        style={{ backgroundColor: "#F7F5EE", color: "#1d2230" }}
        className="min-h-screen antialiased"
      >
        <Suspense fallback={null}><BarraProgresso /></Suspense>
        <div className="barra-marca border-b border-linha bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" aria-label="Painel interno — início">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="REMAX Ville" width={150} height={66} className="h-10 w-auto" />
            </Link>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
