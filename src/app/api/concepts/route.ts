import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs'; // asegura Node runtime

export async function GET() {
  const concepts = await prisma.concept.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(concepts);
}

export async function POST(req: Request) {
  // 1) Leer el secreto del request en ambos formatos
  const headerSecretRaw =
    req.headers.get('x-admin-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  const headerSecret = headerSecretRaw.trim();
  const serverSecret = (process.env.ADMIN_SECRET ?? '').trim();

  if (!serverSecret || headerSecret !== serverSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Validar payload
  const body = await req.json();
  const { code, name, baseUnit, defaultUnitPrice } = body as {
    code?: string;
    name?: string;
    baseUnit?: string;
    defaultUnitPrice?: number | string | null;
  };

  if (!code || !name || !baseUnit) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // 3) Normalizar precio (si viene vacío -> 0)
  const price =
    defaultUnitPrice === undefined ||
    defaultUnitPrice === null ||
    defaultUnitPrice === ''
      ? 0
      : Number(defaultUnitPrice);

  // 4) Crear concepto
  const created = await prisma.concept.create({
    data: {
      code,
      name,
      baseUnit, // debe coincidir con tu enum Unit (PZA, M2, etc.)
      defaultUnitPrice: price,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
