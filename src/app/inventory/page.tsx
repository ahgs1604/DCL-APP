'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Unit = 'PZA' | 'M2' | 'ML' | 'M3' | 'KG' | 'LT' | string;

type InventoryItem = {
  id: string;
  name: string;
  baseUnit: Unit;
  photoUrl?: string | null;
  minStock?: number | null;
  location?: { name: string } | null;
  stock?: number;
  currentStock?: number;
};

export default function InventoryPage() {
  const [secretInput, setSecretInput] = useState('');
  const [secretSaved, setSecretSaved] = useState(false);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('PZA');
  const [photoUrl, setPhotoUrl] = useState('');
  const [locationName, setLocationName] = useState('Oficina');
  const [initialQty, setInitialQty] = useState<string>('0');
  const [minQty, setMinQty] = useState<string>('');

  const [loadingList, setLoadingList] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem('ADMIN_SECRET') || '';
    setSecretInput(saved);
    setSecretSaved(!!saved);
    fetchList();
  }, []);

  const units: Unit[] = useMemo(() => ['PZA', 'M2', 'ML', 'M3', 'KG', 'LT'], []);

  async function fetchList() {
    try {
      setLoadingList(true);
      setErrorMsg('');
      const res = await fetch('/api/inventory', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || data?.message || `Error ${res.status}`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al cargar inventario');
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }

  function handleUseSecret() {
    localStorage.setItem('ADMIN_SECRET', secretInput.trim());
    setSecretSaved(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg('');

    const headerSecret = localStorage.getItem('ADMIN_SECRET') || '';

    const payload = {
      materialSku: sku?.trim() || undefined,
      materialName: name.trim(),
      unit: unit as string,
      photoUrl: photoUrl?.trim() || undefined,
      locationName: locationName.trim(),
      initialQty: Number(initialQty || 0),
      minQty: minQty === '' ? undefined : Number(minQty),
    };

    if (!payload.materialName) {
      alert('El nombre es requerido');
      return;
    }
    if (!payload.locationName) {
      alert('La ubicación es requerida');
      return;
    }

    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': headerSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Error: ${data?.error || data?.message || res.status}`);
      return;
    }

    setSku('');
    setName('');
    setUnit('PZA');
    setPhotoUrl('');
    setLocationName('Oficina');
    setInitialQty('0');
    setMinQty('');

    await fetchList();
  }

  return (
    <div style={{ maxWidth: 780, margin: '24px auto', padding: '0 16px' }}>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/" style={{ marginRight: 12 }}>
          DCL • Estimaciones & Inventario
        </Link>
        <Link href="/estimations/new" style={{ marginRight: 12 }}>
          Nueva estimación
        </Link>
        <Link href="/inventory" style={{ marginRight: 12 }}>
          Inventario
        </Link>
        <Link href="/admin/concepts">Admin catálogo</Link>
      </nav>

      <h1>Inventario</h1>

      <p>
        <Link href="/">← Volver a inicio</Link>
      </p>

      <section style={{ marginTop: 24, marginBottom: 24 }}>
        <h3>ADMIN SECRET</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Pega tu ADMIN_SECRET"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={handleUseSecret}>Usar secreto</button>
          {secretSaved && <span style={{ color: 'green', fontSize: 12 }}>guardado</span>}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Dar de alta producto</h2>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Código (SKU opcional)" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="URL de foto (opcional)" />
          <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Ubicación (ej. Oficina)" required />
          <input value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="Cantidad inicial" inputMode="decimal" />
          <input value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Mínimo (opcional)" inputMode="decimal" />
          <button type="submit" style={{ marginTop: 8 }}>Guardar</button>
        </form>
      </section>

      <section>
        <h2>Existencias</h2>
        {errorMsg && <div style={{ color: 'crimson', marginBottom: 8 }}>{errorMsg}</div>}
        {loadingList ? (
          <div>Cargando…</div>
        ) : items.length === 0 ? (
          <div>No hay productos aún.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map((it) => {
              const stock =
                typeof it.stock === 'number'
                  ? it.stock
                  : typeof it.currentStock === 'number'
                  ? it.currentStock
                  : 0;
              return (
                <div key={it.id} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 6 }}>
                  <div style={{ fontWeight: 600 }}>{it.name}</div>
                  <div style={{ fontSize: 13, color: '#555' }}>
                    Ubicación: {it.location?.name ? it.location.name : '—'} · Unidad: {it.baseUnit}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Stock: <b>{stock}</b>
                    {typeof it.minStock === 'number' && (
                      <span style={{ marginLeft: 8, color: '#555' }}>(mín. {it.minStock})</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
