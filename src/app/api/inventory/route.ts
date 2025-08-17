import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Unit } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: [{ location: { name: "asc" } }, { material: { name: "asc" } }],
      include: { material: true, location: true },
    });

    const data = items.map((it) => ({
      id: it.id,
      materialName: it.material.name,
      sku: it.material.sku,
      unit: it.material.unit as Unit,
      locationName: it.location.name,
      qty: it.qty.toString(),
      minQty: it.minQty ? it.minQty.toString() : null,
      photoUrl: it.material.photoUrl,
    }));

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("GET /api/inventory error:", err?.message || err);
    return NextResponse.json({ error: "Inventory GET failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const body =
      contentType.includes("application/json")
        ? await req.json()
        : Object.fromEntries((await req.formData()).entries());

    const adminSecret = String(body.adminSecret || "");
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sku = String(body.sku || "").trim();
    const name = String(body.name || "").trim();
    const unit = String(body.unit || "PZA").trim() as Unit;
    const photoUrl = body.photoUrl ? String(body.photoUrl) : null;
    const locationName = String(body.locationName || "").trim();
    const qty = Number(body.qty || 0);
    const minQty = body.minQty ? Number(body.minQty) : null;

    if (!sku || !name || !locationName || !qty || isNaN(qty)) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const material = await prisma.material.upsert({
      where: { sku },
      update: { name, unit, photoUrl: photoUrl || undefined },
      create: { sku, name, unit, photoUrl: photoUrl || undefined },
    });

    const location = await prisma.inventoryLocation.upsert({
      where: { name: locationName },
      update: {},
      create: { name: locationName },
    });

    const existing = await prisma.inventoryItem.findFirst({
      where: { materialId: material.id, locationId: location.id },
    });

    let itemId: string;

    if (existing) {
      const updated = await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: {
          qty: existing.qty.plus(qty),
          minQty: minQty ?? existing.minQty,
        },
      });
      itemId = updated.id;
    } else {
      const created = await prisma.inventoryItem.create({
        data: {
          materialId: material.id,
          locationId: location.id,
          qty,
          minQty,
        },
      });
      itemId = created.id;
    }

    await prisma.inventoryMovement.create({
      data: {
        itemId,
        delta: qty,
        reason: "Alta de producto",
      },
    });

    return NextResponse.redirect(new URL("/inventory", req.url), 303);
  } catch (err: any) {
    console.error("POST /api/inventory error:", err?.message || err);
    return NextResponse.json({ error: "Inventory POST failed" }, { status: 500 });
  }
}
