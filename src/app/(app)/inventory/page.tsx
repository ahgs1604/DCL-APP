import Link from "next/link";

export const dynamic = "force-dynamic"; // para que siempre lea DB al cargar

async function fetchItems() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/inventory`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function InventoryPage() {
  const items: Array<{
    id: string;
    materialName: string;
    sku: string;
    unit: string;
    locationName: string;
    qty: string; // viene como string por Decimal
    minQty: string | null;
    photoUrl?: string | null;
  }> = await fetchItems();

  return (
    <div style={{ padding: 16 }}>
      <h1>Inventario</h1>

      <p>
        <Link href="/">← Volver a inicio</Link>
      </p>

      <h2>Dar de alta producto</h2>
      <form method="post" action="/api/inventory" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <input name="adminSecret" placeholder="ADMIN_SECRET" required />
        <input name="sku" placeholder="SKU (ej. ADH-123)" required />
        <input name="name" placeholder="Nombre (ej. Adhesivo Blanco)" required />
        <select name="unit" defaultValue="PZA" required>
          <option value="PZA">PZA</option>
          <option value="M2">M2</option>
          <option value="ML">ML</option>
          <option value="KG">KG</option>
          <option value="LT">LT</option>
        </select>
        <input name="photoUrl" placeholder="URL de foto (opcional)" />
        <input name="locationName" placeholder="Ubicación (ej. Oficina)" required />
        <input name="qty" type="number" step="0.01" placeholder="Cantidad inicial" required />
        <input name="minQty" type="number" step="0.01" placeholder="Mínimo (opcional)" />
        <button type="submit">Guardar</button>
      </form>

      <h2 style={{ marginTop: 24 }}>Existencias</h2>
      {items.length === 0 ? (
        <p>No hay productos aún.</p>
      ) : (
        <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Unidad</th>
              <th>Cantidad</th>
              <th>Mín.</th>
              <th>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.sku}</td>
                <td>
                  {it.materialName}
                  {it.photoUrl ? (
                    <>
                      {" "}
                      — <a href={it.photoUrl} target="_blank">foto</a>
                    </>
                  ) : null}
                </td>
                <td>{it.unit}</td>
                <td>{it.qty}</td>
                <td>{it.minQty ?? "-"}</td>
                <td>{it.locationName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
