import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minhas Finanças",
  description: "Registre receitas e despesas e acompanhe o que foi anotado.",
  manifest: "/manifest.webmanifest",
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
    <html lang="pt-BR" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
