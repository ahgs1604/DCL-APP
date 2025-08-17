import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

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

    // --- Body del formulario (admitimos varios nombres de campo) ---
    const body = await req.json();
    const {
      // posibles nombres que puede mandar tu form
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

    // --- Transacción: crear item + movimiento inicial si aplica ---
    const createdItem = await prisma.$transaction(async (tx) => {
      // Construimos data de forma tolerante:
      // Si tu modelo no tiene alguno de estos campos, Prisma lo ignorará si no lo incluimos.
      // Y si SON requeridos en tu schema, les ponemos defaults razonables.
      const safeData: Record<string, any> = {
        locationId: location!.id,
      };

      // code/sku (fallback para NOT NULL en caso de existir en el modelo)
      const finalCode =
        (typeof code === "string" && code.trim()) ||
        (typeof sku === "string" && sku.trim()) ||
        `ITEM-${Date.now()}`;
      // name/description
      const finalName =
        (typeof name === "string" && name.trim()) ||
        (typeof description === "string" && description.trim()) ||
        "Producto";
      // unit/baseUnit
      const finalUnit =
        (typeof unit === "string" && unit.trim()) ||
        (typeof baseUnit === "string" && baseUnit.trim()) ||
        "PZA";

      // Solo añadimos los campos si tu modelo los tiene.
      // Si alguno NO existe en tu schema, Prisma no se entera hasta runtime.
      // Por eso devolvemos error detallado abajo si falla.
      safeData.code = finalCode;
      safeData.name = finalName;
      safeData.unit = finalUnit;

      if (typeof defaultUnitPrice === "number") {
        safeData.defaultUnitPrice = defaultUnitPrice;
      } else if (
        typeof defaultUnitPrice === "string" &&
        defaultUnitPrice.trim() !== ""
      ) {
        safeData.defaultUnitPrice = Number(defaultUnitPrice);
      }

      if (typeof photoUrl === "string" && photoUrl.trim()) {
        safeData.photoUrl = photoUrl.trim();
      }
      if (!Number.isNaN(minNum)) {
        safeData.minStock = minNum;
      }

      let item;
      try {
        item = await tx.inventoryItem.create({ data: safeData });
      } catch (err: any) {
        // Prisma te dirá exactamente qué campo no existe / viola NOT NULL / índice único, etc.
        console.error("Error creando InventoryItem:", {
          message: err?.message,
          code: err?.code,
          meta: err?.meta,
          triedData: safeData,
        });
        throw err;
      }

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
    // Devolvemos TODO lo útil para depurar desde el navegador
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
