import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const concepts = await prisma.concept.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(concepts);
}

export async function POST(req: Request) {
  const adminHeader = req.headers.get('x-admin-secret') || '';
  if (adminHeader !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { code, name, baseUnit, defaultUnitPrice } = body;
  if (!code || !name || !baseUnit) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const created = await prisma.concept.create({
    data: {
      code,
      name,
      baseUnit,
      defaultUnitPrice: defaultUnitPrice ?? 0,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
