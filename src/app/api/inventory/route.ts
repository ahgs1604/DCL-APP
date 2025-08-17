// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: lista de inventario */
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: {
        location: true,
        movements: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** POST: alta de producto */
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
      code,
      sku,
      name,
      description,
      unit,
      baseUnit,
      photoUrl,
      locationName,
      initialQty,
      minStock,
      defaultUnitPrice,

      // IMPORTANTE: FK de Material como STRING (uuid/cuid)
      materialId,
    } = body as Record<string, unknown>;

    if (!locationName || typeof locationName !== "string") {
      return NextResponse.json(
        { error: "Faltan campos", detail: "locationName es requerido" },
        { status: 400 }
      );
    }

    // materialId requerido y debe ser string no vacío
    const materialIdStr =
      typeof materialId === "string" ? materialId.trim() : "";
    if (!materialIdStr) {
      return NextResponse.json(
        { error: "Faltan campos", detail: "materialId (string) es requerido" },
        { status: 400 }
      );
    }

    const qtyNum = Number(initialQty ?? 0);
    const minNum = Number(minStock ?? 0);

    // --- Ubicación: findFirst + create si no existe ---
    let location = await prisma.inventoryLocation.findFirst({
      where: { name: locationName as string },
    });
    if (!location) {
      location = await prisma.inventoryLocation.create({
        data: { name: locationName as string },
      });
    }

    // --- Transacción ---
    const createdItem = await prisma.$transaction(async (tx) => {
      // Derivamos valores finales
      const finalCode =
        (typeof code === "string" && code.trim()) ||
        (typeof sku === "string" && sku.trim()) ||
        `ITEM-${Date.now()}`;

      const finalName =
        (typeof name === "string" && name.trim()) ||
        (typeof description === "string" && description.trim()) ||
        "Producto";

      const finalUnit =
        (typeof unit === "string" && unit.trim()) ||
        (typeof baseUnit === "string" && baseUnit.trim()) ||
        "PZA";

      const data: Prisma.InventoryItemUncheckedCreateInput = {
        code: finalCode,
        name: finalName,
        unit: finalUnit,

        // Requeridos por tu schema
        qty: Number.isFinite(qtyNum) ? qtyNum : 0,
        materialId: materialIdStr,   // <-- STRING, no number
        locationId: location.id,     // string o int según tu schema (Prisma infiere de .id)

        // Opcionales (si existen en tu schema)
        ...(photoUrl && typeof photoUrl === "string" && photoUrl.trim()
          ? { photoUrl: photoUrl.trim() }
          : {}),
        ...(!Number.isNaN(minNum) ? { minStock: minNum } : {}),
        ...(typeof defaultUnitPrice === "number" ||
        (typeof defaultUnitPrice === "string" &&
          defaultUnitPrice.trim() !== "")
          ? { defaultUnitPrice: Number(defaultUnitPrice) }
          : {}),
      };

      const item = await tx.inventoryItem.create({ data });

      if (qtyNum > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            delta: qtyNum,
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
