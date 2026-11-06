import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "Universal Science Lab — Laboratorio de Electrónica (MVP)",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

// Runs before paint (blocking, no React) so the stored theme choice applies
// immediately instead of flashing dark-then-light/light-then-dark.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("usl-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
