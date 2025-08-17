import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs'; // asegurar runtime de Node

// GET: lista de inventario con stock calculado desde movements.delta
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        location: true,
        movements: true, // usamos 'delta' para calcular stock
      },
    });

    const withStock = items.map((item) => {
      const stock = item.movements.reduce((sum, m) => {
        return sum + Number(m.delta || 0);
      }, 0);
      return { ...item, stock };
    });

    return NextResponse.json(withStock);
  } catch (err: any) {
    console.error('Error en GET /api/inventory:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err.message },
      { status: 500 },
    );
  }
}

// POST: crea un nuevo ítem de inventario (sin campos que no existan en el schema)
export async function POST(req: Request) {
  try {
    // Auth sencilla por header
    const headerSecretRaw =
      req.headers.get('x-admin-secret') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';
    const headerSecret = headerSecretRaw.trim();
    const serverSecret = (process.env.ADMIN_SECRET ?? '').trim();
    if (!serverSecret || headerSecret !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Recibimos lo que viene del form, pero SOLO usamos lo que existe en InventoryItem
    const {
      // code,                          // <- NO existe en InventoryItem (ignorado)
      name,
      baseUnit,
      photoUrl,                         // <- si tu schema tiene photoUrl
      locationName,                     // <- nombre de ubicación (ej. "Oficina")
      minStock,                         // <- opcional
      // initialQty,                    // <- lo ignoramos por ahora para no crear movimientos
      // defaultUnitPrice               // <- NO existe en InventoryItem (es de Concept)
    } = body as {
      name?: string;
      baseUnit?: string;
      photoUrl?: string | null;
      locationName?: string | null;
      minStock?: number | string | null;
    };

    if (!name || !baseUnit) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 1) Asegurar ubicación por nombre (si viene)
    let locationId: string | null = null;
    const locName = (locationName ?? '').trim();
    if (locName) {
      const existing = await prisma.inventoryLocation.findFirst({
        where: { name: locName },
        select: { id: true },
      });
      if (existing) {
        locationId = existing.id;
      } else {
        const createdLoc = await prisma.inventoryLocation.create({
          data: { name: locName },
          select: { id: true },
        });
        locationId = createdLoc.id;
      }
    }

    // 2) Normalizar opcionales
    const minStockNum =
      minStock === undefined || minStock === null || minStock === ''
        ? null
        : Number(minStock);

    // 3) Crear el item SOLO con campos válidos del schema
    const created = await prisma.inventoryItem.create({
      data: {
        name,
        baseUnit,           // respeta tu enum Unit en el schema
        photoUrl: photoUrl ?? null,   // quita esta línea si tu modelo no tiene photoUrl
        minStock: minStockNum,        // quita si tu modelo no tiene minStock
        locationId,                   // puede ser null si no se pasó ubicación
      },
    });

    // Si algún día quieres crear movimiento inicial, aquí:
    // if (initialQty && Number(initialQty) !== 0) {
    //   await prisma.inventoryMovement.create({
    //     data: {
    //       itemId: created.id,
    //       userId: 'system',        // ajusta según tu schema
    //       projectId: 'inventory',  // ajusta según tu schema
    //       delta: new Prisma.Decimal(Number(initialQty)),
    //       reason: 'ALTA',
    //     },
    //   });
    // }

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error('Error en POST /api/inventory:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err.message },
      { status: 500 },
    );
  }
}
