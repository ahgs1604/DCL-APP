import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs';

// GET: lista de items con ubicación y stock calculado
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: {
        location: true,
        movements: { select: { delta: true } },
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
      name,            // puede que NO exista en tu modelo InventoryItem
      baseUnit,        // puede que NO exista en tu modelo InventoryItem
      photoUrl,
      locationName,
      initialQty,
      minStock,
    } = body as Partial<{
      name: string;
      baseUnit: string;
      photoUrl?: string;
      locationName: string;
      initialQty: number | string;
      minStock: number | string;
    }>;

    if (!locationName) {
      return NextResponse.json(
        { error: 'Faltan campos', detail: 'locationName es requerido' },
        { status: 400 }
      );
    }

    const qtyNum = Number(initialQty ?? 0);
    const minNum = Number(minStock ?? 0);

    // --- 3) Buscar o crear ubicación (sin upsert) ---
    let location = await prisma.inventoryLocation.findFirst({
      where: { name: locationName },
    });

    if (!location) {
      location = await prisma.inventoryLocation.create({
        data: { name: locationName },
      });
    }

    // --- 4) Crear item + movimiento inicial en transacción ---
    const result = await prisma.$transaction(async (tx) => {
      // Construimos el payload con los campos que tengas disponibles
      const data: Record<string, any> = {
        locationId: location!.id,
      };

      // Añade solo si tu modelo lo soporta:
      if (typeof name === 'string' && name.trim()) data.name = name.trim();
      if (typeof baseUnit === 'string' && baseUnit.trim()) data.baseUnit = baseUnit.trim();
      if (photoUrl) data.photoUrl = photoUrl;
      if (!Number.isNaN(minNum)) data.minStock = minNum;

      // Casteamos a any para no romper en build si el tipo de Prisma no tiene esos campos
      const item = await tx.inventoryItem.create({
        data: data as any,
      });

      if (qtyNum > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            delta: qtyNum,
            reason: 'Alta inicial',
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
    return NextResponse.json(
      { error: 'Error interno', detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
