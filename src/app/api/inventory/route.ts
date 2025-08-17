// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { Prisma, Unit } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// helper para validar el enum Unit
function isUnit(value: unknown): value is Unit {
  return Object.values(Unit).includes(value as Unit);
}

/** GET: lista de inventario en forma amigable para la UI */
export async function GET() {
  try {
    const rows = await prisma.inventoryItem.findMany({
      include: {
        material: true,
        location: true,
        movements: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = rows.map((it) => ({
      id: it.id,
      name: it.material.name,
      baseUnit: it.material.unit,
      photoUrl: it.material.photoUrl ?? undefined,
      minStock: it.minQty ? Number(it.minQty) : undefined,
      location: { name: it.location?.name ?? "" },
      stock: Number(it.qty),
      currentStock: Number(it.qty),
      lastMovement: it.movements?.[0]
        ? {
            delta: Number(it.movements[0].delta),
            reason: it.movements[0].reason ?? undefined,
            at: it.movements[0].createdAt.toISOString(),
          }
        : undefined,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** POST: alta de producto + material/location si aplica */
export async function POST(req: Request) {
  try {
    // --- Auth por secreto ---
    const headerSecretRaw =
      req.headers.get("x-admin-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    const headerSecret = headerSecretRaw.trim();
    const serverSecret = (process.env.ADMIN_SECRET ?? "").trim();

    if (!serverSecret || headerSecret !== serverSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- Body ---
    const body = await req.json();
    const {
      materialSku,
      materialName,
      unit,
      photoUrl,
      locationName,
      initialQty,
      minQty,
    } = body as Record<string, unknown>;

    // Validaciones mínimas
    if (!materialName || typeof materialName !== "string" || !materialName.trim()) {
      return NextResponse.json(
        { error: "Faltan campos", detail: "materialName es requerido" },
        { status: 400 }
      );
    }
    if (!locationName || typeof locationName !== "string" || !locationName.trim()) {
      return NextResponse.json(
        { error: "Faltan campos", detail: "locationName es requerido" },
        { status: 400 }
      );
    }
    if (!unit || !isUnit(unit)) {
      return NextResponse.json(
        { error: "Unidad inválida", detail: `unit debe ser uno de: ${Object.values(Unit).join(", ")}` },
        { status: 400 }
      );
    }

    const qtyNum = Number(initialQty ?? 0);
    const minQtyNum = minQty === null || minQty === undefined ? undefined : Number(minQty);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }
    if (minQtyNum !== undefined && !Number.isFinite(minQtyNum)) {
      return NextResponse.json({ error: "minQty inválido" }, { status: 400 });
    }

    // --- Resolver/crear material (upsert por SKU si viene)
    const skuStr =
      typeof materialSku === "string" && materialSku.trim() ? materialSku.trim() : null;

    const material = skuStr
      ? await prisma.material.upsert({
          where: { sku: skuStr },
          update: {
            name: materialName.trim(),
            unit,
            ...(photoUrl && typeof photoUrl === "string" && photoUrl.trim()
              ? { photoUrl: photoUrl.trim() }
              : {}),
          },
          create: {
            sku: skuStr,
            name: materialName.trim(),
            unit,
            ...(photoUrl && typeof photoUrl === "string" && photoUrl.trim()
              ? { photoUrl: photoUrl.trim() }
              : {}),
          },
          select: { id: true },
        })
      : await prisma.material.create({
          data: {
            // Generar SKU simple si no viene
            sku: `${materialName
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 20) || "MAT"}-${Date.now()}`,
            name: materialName.trim(),
            unit,
            ...(photoUrl && typeof photoUrl === "string" && photoUrl.trim()
              ? { photoUrl: photoUrl.trim() }
              : {}),
          },
          select: { id: true },
        });

    // --- Resolver/crear ubicación (findFirst + create porque name NO es único)
    let loc = await prisma.inventoryLocation.findFirst({
      where: { name: locationName.trim() },
      select: { id: true },
    });
    if (!loc) {
      loc = await prisma.inventoryLocation.create({
        data: { name: locationName.trim() },
        select: { id: true },
      });
    }

    // --- Crear item + movimiento inicial (si qty > 0)
    const createdItem = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          materialId: material.id,
          locationId: loc.id,
          qty: new Prisma.Decimal(qtyNum),
          ...(minQtyNum !== undefined ? { minQty: new Prisma.Decimal(minQtyNum) } : {}),
        },
        select: { id: true },
      });

      if (qtyNum > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            delta: new Prisma.Decimal(qtyNum),
            reason: "Alta inicial",
            userId: "system",
            projectId: "inventory",
          },
        });
      }

      return item;
    });

    return NextResponse.json({ ok: true, item: createdItem }, { status: 201 });
  } catch (err: any) {
    const payload = {
      error: "Error interno",
      message: err?.message ?? String(err),
      code: err?.code ?? undefined,
      meta: err?.meta ?? undefined,
    };
    console.error("POST /api/inventory error:", payload);
    return NextResponse.json(payload, { status: 500 });
  }
}
