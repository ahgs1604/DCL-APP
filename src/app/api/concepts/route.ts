import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { Unit } from '@prisma/client'; // <- enum del schema Prisma

export const runtime = 'nodejs';

// helper para validar el enum
function isUnit(value: unknown): value is Unit {
  return Object.values(Unit).includes(value as Unit);
}

export async function GET() {
  const concepts = await prisma.concept.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(concepts);
}

export async function POST(req: Request) {
  // Secreto vía header (x-admin-secret) o Authorization: Bearer
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
  const {
    code,
    name,
    baseUnit: baseUnitRaw,
    defaultUnitPrice,
  }: {
    code?: string;
    name?: string;
    baseUnit?: string;
    defaultUnitPrice?: number | string | null;
  } = body;

  if (!code || !name || !baseUnitRaw) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Validar / convertir baseUnit al enum Unit
  if (!isUnit(baseUnitRaw)) {
    return NextResponse.json(
      {
        error: 'Invalid baseUnit',
        allowed: Object.values(Unit), // Ej: ["PZA","M2","ML","KG","LT"]
      },
      { status: 400 }
    );
  }
  const baseUnit: Unit = baseUnitRaw;

  // Normalizar precio
  const price =
    defaultUnitPrice === undefined ||
    defaultUnitPrice === null ||
    defaultUnitPrice === ''
      ? 0
      : Number(defaultUnitPrice);

  const created = await prisma.concept.create({
    data: {
      code,
      name,
      baseUnit, // ahora es Unit (enum), no string
      defaultUnitPrice: price,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
