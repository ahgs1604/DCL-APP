'use client';

import { useEffect, useState } from 'react';

type Concept = {
  id: string;
  code: string;
  name: string;
  baseUnit: 'PZA' | 'M2' | 'ML' | 'KG' | 'LT';
  defaultUnitPrice: string | number | null;
};

export default function AdminConcepts() {
  const [secret, setSecret] = useState('');
  const [ok, setOk] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [form, setForm] = useState({ code: '', name: '', baseUnit: 'PZA', defaultUnitPrice: '' });

  useEffect(() => {
    const s = localStorage.getItem('ADMIN_SECRET') || '';
    if (s) { setSecret(s); setOk(true); }
    fetch('/api/concepts').then(r => r.json()).then(setConcepts).catch(() => {});
  }, []);

  const useSecret = () => {
    if (!secret) return;
    localStorage.setItem('ADMIN_SECRET', secret);
    setOk(true);
  };

  const createConcept = async () => {
    if (!ok) { alert('Primero guarda el ADMIN SECRET'); return; }
    const res = await fetch('/api/concepts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret,
      },
      body: JSON.stringify({
        ...form,
        defaultUnitPrice: form.defaultUnitPrice ? Number(form.defaultUnitPrice) : undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert('Error: ' + (j.error || res.status));
      return;
    }
    setForm({ code: '', name: '', baseUnit: 'PZA', defaultUnitPrice: '' });
    const list = await fetch('/api/concepts').then(r => r.json());
    setConcepts(list);
  };

  return (
    <main style={{ padding: 16 }}>
      <h1>Admin catálogo</h1>

      <section style={{ marginTop: 12, padding: 12, border: '1px solid #444' }}>
        <h3>1) ADMIN SECRET</h3>
        <input
          placeholder="Pega tu ADMIN_SECRET"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={{ width: 320, marginRight: 8 }}
        />
        <button onClick={useSecret}>Usar secreto</button>
        {ok && <span style={{ marginLeft: 8 }}>✅ guardado</span>}
      </section>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #444' }}>
        <h3>2) Crear concepto</h3>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <input placeholder="Código (ej. MURO-ML)" value={form.code}
            onChange={e => setForm({ ...form, code: e.target.value })} />
          <input placeholder="Nombre" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <select value={form.baseUnit}
            onChange={e => setForm({ ...form, baseUnit: e.target.value as any })}>
            <option value="PZA">PZA</option>
            <option value="M2">M2</option>
            <option value="ML">ML</option>
            <option value="KG">KG</option>
            <option value="LT">LT</option>
          </select>
          <input placeholder="Precio unitario (opcional)"
            value={form.defaultUnitPrice}
            onChange={e => setForm({ ...form, defaultUnitPrice: e.target.value })} />
          <button onClick={createConcept}>Guardar</button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>3) Catálogo</h3>
        <ul>
          {concepts.map(c => (
            <li key={c.id}>
              <code>{c.code}</code> — {c.name} ({c.baseUnit}) {c.defaultUnitPrice ? `• $${c.defaultUnitPrice}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
