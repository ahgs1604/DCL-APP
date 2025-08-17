import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { Prisma, Unit } from '@prisma/client';

export const runtime = 'nodejs'; // asegura Node runtime

// -----------------------------
// Helpers
// -----------------------------
function getAdminSecret(req: Request) {
  const raw =
    req.headers.get('x-admin-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return raw.trim();
}
function toNum(v: unknown, def = 0) {
  if (v === '' || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function normStr(v: unknown) {
  return (typeof v === 'string' ? v : '').trim();
}
function isUnit(u: string): u is Unit {
  return Object.values(Unit).includes(u as Unit);
}

// -----------------------------
// GET: lista de items con material, ubicación y stock calculado
//   - Tu schema tiene InventoryItem { materialId, locationId, qty, minQty, ... }
//   - Sumamos movimientos.delta por si quieres ver histórico; pero mostramos qty también.
// -----------------------------
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        material: true,   // <- nombre, sku, unit, photoUrl viven aquí
        location: true,   // <- nombre de la ubicación
        movements: true,  // <- delta (Decimal) para calcular histórico
      },
    });

    const data = items.map((it) => {
      const movementSum = it.movements.reduce((acc, m) => acc + Number(m.delta || 0), 0);
      return {
        id: it.id,
        // stock actual guardado en el item:
        qty: Number(it.qty || 0),
        // histórico calculado por movimientos (útil para auditar):
        movementStock: movementSum,
        minQty: it.minQty != null ? Number(it.minQty) : null,
        createdAt: it.createdAt,
        // material asociado
        material: {
          id: it.material.id,
          sku: it.material.sku,
          name: it.material.name,
          unit: it.material.unit,
          photoUrl: it.material.photoUrl,
        },
        // ubicación asociada
        location: {
          id: it.location.id,
          name: it.location.name,
        },
      };
    });

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('GET /api/inventory error:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

// -----------------------------
// POST: Alta de Material + Item (y movimiento inicial)
//   Espera en el body:
//   {
//     materialSku?: string,
//     materialName: string,
//     unit: "PZA" | "M2" | "ML" | "KG" | "LT" | ... (según tu enum),
//     photoUrl?: string,
//     locationName: string,
//     initialQty?: number | string,   // stock inicial
//     minQty?: number | string        // mínimo deseado
//   }
// -----------------------------
export async function POST(req: Request) {
  try {
    // 1) auth admin
    const headerSecret = getAdminSecret(req);
    const serverSecret = (process.env.ADMIN_SECRET ?? '').trim();
    if (!serverSecret || headerSecret !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2) leer y validar body
    const body = await req.json();
    const materialSku = normStr(body.materialSku);
    const materialName = normStr(body.materialName);
    const unitRaw = normStr(body.unit).toUpperCase();
    const photoUrl = normStr(body.photoUrl);
    const locationName = normStr(body.locationName);
    const initialQty = toNum(body.initialQty, 0);
    const minQty = body.minQty === '' || body.minQty == null ? null : toNum(body.minQty, 0);

    if (!materialName || !unitRaw || !locationName) {
      return NextResponse.json(
        { error: 'Faltan campos: materialName, unit y locationName son obligatorios' },
        { status: 400 },
      );
    }
    if (!isUnit(unitRaw)) {
      return NextResponse.json(
        { error: `Unidad inválida: ${unitRaw}`, allowed: Object.values(Unit) },
        { status: 400 },
      );
    }
    const unit = unitRaw as Unit;

    // 3) asegurar Material (por SKU si viene, si no por nombre)
    let material = null as null | { id: string };
    if (materialSku) {
      material = await prisma.material.findUnique({
        where: { sku: materialSku },
        select: { id: true },
      });
      if (!material) {
        const created = await prisma.material.create({
          data: {
            sku: materialSku,
            name: materialName,
            unit,
            photoUrl: photoUrl || null,
          },
          select: { id: true },
        });
        material = created;
      } else {
        // si ya existe material por SKU, opcionalmente podrías actualizar nombre/unit/photoUrl aquí
      }
    } else {
      // sin SKU, intenta encontrar por nombre+unidad
      material = await prisma.material.findFirst({
        where: { name: materialName, unit },
        select: { id: true },
      });
      if (!material) {
        material = await prisma.material.create({
          data: {
            sku: `${materialName}-${Date.now()}`.slice(0, 30), // SKU autogenerado simple
            name: materialName,
            unit,
            photoUrl: photoUrl || null,
          },
          select: { id: true },
        });
      }
    }

    // 4) asegurar ubicación por nombre
    let location = await prisma.inventoryLocation.findFirst({
      where: { name: locationName },
      select: { id: true },
    });
    if (!location) {
      location = await prisma.inventoryLocation.create({
        data: { name: locationName },
        select: { id: true },
      });
    }

    // 5) crear InventoryItem (qty = initialQty, minQty)
    const item = await prisma.inventoryItem.create({
      data: {
        materialId: material.id,
        locationId: location.id,
        qty: new Prisma.Decimal(initialQty),
        minQty: minQty == null ? null : new Prisma.Decimal(minQty),
      },
      select: { id: true, qty: true, minQty: true, locationId: true, materialId: true, createdAt: true },
    });

    // 6) registrar movimiento inicial si initialQty != 0
    if (initialQty !== 0) {
      await prisma.inventoryMovement.create({
        data: {
          itemId: item.id,
          delta: new Prisma.Decimal(initialQty), // positivo entra stock
          reason: 'Carga inicial',
          // userId / projectId son opcionales en tu schema
        },
      });
    }

    // 7) devolver item + joins útiles
    const withJoins = await prisma.inventoryItem.findUnique({
      where: { id: item.id },
      include: {
        material: true,
        location: true,
        movements: true,
      },
    });

    return NextResponse.json(withJoins, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/inventory error:', err);
    const code = (err as any)?.code;
    if (code === 'P2002') {
      return NextResponse.json({ error: 'Duplicado (unique constraint)' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Error interno', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
