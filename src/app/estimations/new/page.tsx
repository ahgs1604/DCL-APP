'use client';

import { useEffect, useState } from 'react';

type Concept = { id: string; code: string; name: string; baseUnit: string };

export default function NewEstimate() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [useOther, setUseOther] = useState(false);
  const [item, setItem] = useState({ conceptId: '', conceptName: '', qty: '' });

  useEffect(() => {
    fetch('/api/concepts').then(r => r.json()).then(setConcepts).catch(() => {});
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <h1>Nueva estimación</h1>

      <label>
        Concepto:
        {!useOther ? (
          <select
            value={item.conceptId}
            onChange={e => setItem({ ...item, conceptId: e.target.value })}
            style={{ marginLeft: 8 }}
          >
            <option value="">Selecciona…</option>
            {concepts.map(c => (
              <option value={c.id} key={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        ) : (
          <input
            placeholder="Escribe el concepto"
            value={item.conceptName}
            onChange={e => setItem({ ...item, conceptName: e.target.value })}
            style={{ marginLeft: 8 }}
          />
        )}
      </label>

      <div style={{ marginTop: 8 }}>
        <label>
          <input type="checkbox" checked={useOther} onChange={(e) => setUseOther(e.target.checked)} />
          &nbsp;Usar “Otro”
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          placeholder="Cantidad (ej. metros lineales)"
          value={item.qty}
          onChange={e => setItem({ ...item, qty: e.target.value })}
        />
      </div>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        (Demo simple para validar flujo; luego conectamos todo el carrito y exportar a Excel.)
      </p>
    </main>
  );
}
