// src/app/api/inventory/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { Prisma } from "@prisma/client"; // <-- importa tipos

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
      material, // <-- NUEVO: lo leemos del body si viene
    } = body as Record<string, unknown>;

    if (!locationName || typeof locationName !== "string") {
      return NextResponse.json(
        { error: "Faltan campos", detail: "locationName es requerido" },
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

      const finalMaterial =
        (typeof material === "string" && material.trim()) || "GEN"; // default seguro

      const data: Prisma.InventoryItemCreateInput = {
        code: finalCode,
        name: finalName,
        unit: finalUnit,
        // Campos requeridos por tu schema:
        qty: Number.isFinite(qtyNum) ? qtyNum : 0,
        material: finalMaterial,
        // Relación location en modo "checked"
        location: { connect: { id: location.id } },
      };

      if (photoUrl && typeof photoUrl === "string" && photoUrl.trim()) {
        (data as any).photoUrl = photoUrl.trim();
      }
      if (!Number.isNaN(minNum)) {
        (data as any).minStock = minNum;
      }
      if (
        typeof defaultUnitPrice === "number" ||
        (typeof defaultUnitPrice === "string" && defaultUnitPrice.trim() !== "")
      ) {
        (data as any).defaultUnitPrice = Number(defaultUnitPrice);
      }

      let item;
      try {
        item = await tx.inventoryItem.create({ data });
      } catch (err: any) {
        console.error("Error creando InventoryItem:", {
          message: err?.message,
          code: err?.code,
          meta: err?.meta,
          triedData: data,
        });
        throw err;
      }

      if (qtyNum > 0) {
        await tx.inventoryMovement.create({
          data: {
            item: { connect: { id: item.id } }, // opcional: itemId si tu modelo lo usa
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
