import Link from "next/link";

export default function NavBar() {
  return (
    <nav style={{ padding: "12px 16px", borderBottom: "1px solid #ccc" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link href="/">DCL • Estimaciones & Inventario</Link>
        <Link href="/estimations/new">Nueva estimación</Link>
        <Link href="/inventory">Inventario</Link>
        <Link href="/admin/concepts">Admin catálogo</Link>
      </div>
    </nav>
  );
}
