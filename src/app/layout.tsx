import type { Metadata } from "next";
import NavBar from "./NavBar";

export const metadata: Metadata = {
  title: "DCL • Estimaciones & Inventario",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <NavBar />
        <main style={{ padding: 16 }}>{children}</main>
      </body>
    </html>
  );
}
