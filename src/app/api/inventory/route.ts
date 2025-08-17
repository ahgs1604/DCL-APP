import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs'; // asegurar runtime de Node

// GET: lista de inventario con stock calculado
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        location: true,
        movements: true, // trae todos los movimientos (con 'delta')
      },
    });

    // Stock = suma de los deltas (Decimal -> Number)
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
      { status: 500 }
    );
  }
}

// POST: crea un nuevo ítem de inventario
export async function POST(req: Request) {
  try {
    // auth por encabezado (x-admin-secret o Authorization: Bearer <secret>)
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
    const { code, name, baseUnit, defaultUnitPrice, locationId } = body as {
      code?: string;
      name?: string;
      baseUnit?: string;
      defaultUnitPrice?: number | string | null;
      locationId?: string | null;
    };

    if (!code || !name || !baseUnit) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const price =
      defaultUnitPrice === undefined ||
      defaultUnitPrice === null ||
      defaultUnitPrice === ''
        ? 0
        : Number(defaultUnitPrice);

    const created = await prisma.inventoryItem.create({
      data: {
        code,
        name,
        baseUnit, // respeta tu enum Unit en el schema
        defaultUnitPrice: price,
        locationId: locationId ?? null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    console.error('Error en POST /api/inventory:', err);
    return NextResponse.json(
      { error: 'Error interno', detail: err.message },
      { status: 500 }
    );
  }
}
