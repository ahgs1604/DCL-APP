import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs';

// GET: lista de items con ubicación y stock calculado
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: {
        location: true,
        movements: {
          select: { delta: true }, // solo necesitamos delta para sumar stock
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withStock = items.map((it) => {
      const stock = it.movements.reduce((sum, m) => sum + Number(m.delta), 0);
      const { movements, ...rest } = it;
      return { ...rest, stock };
    });

    return NextResponse.json(withStock);
  } catch (err: any) {
    console.error('GET /api/inventory error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch inventory', detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// POST: alta de producto + movimiento inicial opcional
export async function POST(req: Request) {
  try {
    // --- 1) Auth por secreto ---
    const headerSecretRaw =
      req.headers.get('x-admin-secret') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';
    const headerSecret = headerSecretRaw.trim();
    const serverSecret = (process.env.ADMIN_SECRET ?? '').trim();

    if (!serverSecret || headerSecret !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- 2) Payload ---
    const body = await req.json();
    const {
      // del formulario
      code,            // si tu modelo NO tiene "code", lo ignoramos
      name,
      baseUnit,        // debe coincidir con el enum Unit de tu schema (p.ej. 'PZA', 'M2', etc.)
      photoUrl,
      locationName,
      initialQty,
      minStock,
    } = body as Partial<{
      code: string;
      name: string;
      baseUnit: string;
      photoUrl?: string;
      locationName: string;
      initialQty: number | string;
      minStock: number | string;
    }>;

    if (!name || !baseUnit || !locationName) {
      return NextResponse.json(
        { error: 'Faltan campos', detail: 'name, baseUnit y locationName son requeridos' },
        { status: 400 }
      );
    }

    const qtyNum = Number(initialQty ?? 0);
    const minNum = Number(minStock ?? 0);

    // --- 3) Upsert de ubicación ---
    const location = await prisma.inventoryLocation.upsert({
      where: { name: locationName },
      update: {},
      create: { name: locationName },
    });

    // --- 4) Crear item + movimiento inicial en transacción ---
    const result = await prisma.$transaction(async (tx) => {
      // Ajusta los campos de acuerdo a tu modelo InventoryItem.
      // Campos seguros: name, baseUnit, locationId, photoUrl?, minStock?
      const item = await tx.inventoryItem.create({
        data: {
          name,
          baseUnit: baseUnit as any, // cast si el enum es Unit
          locationId: location.id,
          ...(photoUrl ? { photoUrl } : {}),
          ...(Number.isFinite(minNum) ? { minStock: minNum } : {}),
          // Si tu modelo SÍ tiene "code" y quieres usarlo, descomenta:
          // ...(code ? { code } : {}),
        },
      });

      // Movimiento inicial (solo si > 0)
      if (qtyNum > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            delta: qtyNum,              // positiva suma al stock
            reason: 'Alta inicial',
            // IMPORTANTE: estos dos parecen requeridos en tu schema
            userId: 'system',
            projectId: 'inventory',
          },
        });
      }

      return item;
    });

    return NextResponse.json({ ok: true, item: result }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/inventory error:', err);
    // Prisma suele traer info útil en err.code, err.meta, etc.
    return NextResponse.json(
      {
        error: 'Error interno',
        detail: err?.message ?? String(err),
        // Si quieres mayor visibilidad temporal:
        // meta: (err as any)?.meta ?? null,
        // code: (err as any)?.code ?? null,
      },
      { status: 500 }
    );
  }
}
