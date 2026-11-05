import "./globals.css";

export const metadata = {
  title: "Universal Science Lab — Laboratorio de Electrónica (MVP)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
