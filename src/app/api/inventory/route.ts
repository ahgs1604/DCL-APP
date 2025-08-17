import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs'; // asegúrate de usar runtime Node

type Body = {
  name?: string;
  description?: string;
  unit?: string;
  photoUrl?: string;
  locationName?: string;
  initialQty?: number | string | null;
  minQty?: number | string | null;
};

function okNum(v: unknown, def = 0) {
  if (v === '' || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normStr(v: unknown) {
  return (typeof v === 'string' ? v : '').trim();
}

function isAllowedUnit(u: string) {
  // Ajusta si tu enum Unit tiene más opciones
  return ['PZA', 'M2', 'ML', 'M3', 'KG', 'LT'].includes(u);
}

function getAdminSecret(req: Request) {
  const header =
    req.headers.get('x-admin-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return header.trim();
}

// ------------------------------------------------------------------
// GET: devuelve items con su ubicación y stock calculado
// ------------------------------------------------------------------
export async function GET() {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      location: true,
      movements: {
        select: { quantity: true, type: true },
      },
    },
  });

  const data = items.map((i) => {
    const stock = i.movements.reduce((acc, m) => {
      return acc + (m.type === 'IN' ? m.quantity : -m.quantity);
    }, 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { movements, ...rest } = i as any;
    return { ...rest, stock };
  });

  return NextResponse.json(data);
}

// ------------------------------------------------------------------
// POST: crea item, crea/usa ubicación y registra carga inicial
// ------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // 1) Autorización admin
    const headerSecret = getAdminSecret(req);
    const serverSecret = (process.env.ADMIN_SECRET ?? '').trim();

    if (!serverSecret || headerSecret !== serverSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2) Body + validaciones
    const raw: Body = await req.json();

    const name = normStr(raw.name);
    const description = normStr(raw.description);
    const unit = normStr(raw.unit).toUpperCase(); // PZA, M2, etc.
    const photoUrl = normStr(raw.photoUrl);
    const locationName = normStr(raw.locationName);
    const initialQty = okNum(raw.initialQty, 0);
    const minQty = okNum(raw.minQty, 0);

    if (!name || !unit || !locationName) {
      return NextResponse.json(
        { error: 'Faltan campos: name, unit y locationName son obligatorios' },
        { status: 400 }
      );
    }
    if (!isAllowedUnit(unit)) {
      return NextResponse.json(
        { error: `La unidad ${unit} no es válida` },
        { status: 400 }
      );
    }

    // 3) Asegurar ubicación (sin requerir unique index en name)
    const existingLoc = await prisma.inventoryLocation.findFirst({
      where: { name: locationName },
      select: { id: true },
    });

    const locationId =
      existingLoc?.id ??
      (await prisma.inventoryLocation.create({
        data: { name: locationName },
        select: { id: true },
      })).id;

    // 4) Crear item
    const item = await prisma.inventoryItem.create({
      data: {
        name,
        description: description || null,
        unit: unit as any, // mapea a tu enum Unit
        photoUrl: photoUrl || null,
        locationId,
        minStock: minQty,
      },
      select: {
        id: true,
        name: true,
        unit: true,
        minStock: true,
        photoUrl: true,
        locationId: true,
        createdAt: true,
      },
    });

    // 5) Registrar movimiento inicial si aplica
    if (initialQty > 0) {
      await prisma.inventoryMovement.create({
        data: {
          itemId: item.id,
          type: 'IN',
          quantity: initialQty,
          note: 'Carga inicial',
        },
      });
    }

    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    // Devuelve mensaje útil para depurar
    return NextResponse.json(
      {
        error: 'Error al crear el producto',
        detail:
          typeof err?.message === 'string'
            ? err.message
            : JSON.stringify(err),
      },
      { status: 500 }
    );
  }
}
