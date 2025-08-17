import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

// -------- GET: lista de inventario --------
export async function GET() {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: {
        location: true,
        movements: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// -------- POST: agregar nuevo item --------
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

    // --- Payload del form ---
    const body = await req.json();
    const {
      name,        // puede que NO exista en tu modelo InventoryItem
      baseUnit,    // puede que NO exista en tu modelo InventoryItem
      photoUrl,
      locationName,
      initialQty,
      minStock,
    } = body as Partial<{
      name: string;
      baseUnit: string;
      photoUrl?: string;
      locationName: string;
      initialQty: number | string;
      minStock: number | string;
    }>;

    if (!locationName) {
      return NextResponse.json(
        { error: "Faltan campos", detail: "locationName es requerido" },
        { status: 400 }
      );
    }

    const qtyNum = Number(initialQty ?? 0);
    const minNum = Number(minStock ?? 0);

    // --- Buscar o crear ubicación (sin upsert por índice único) ---
    let location = await prisma.inventoryLocation.findFirst({
      where: { name: locationName },
    });
    if (!location) {
      location = await prisma.inventoryLocation.create({
        data: { name: locationName },
      });
    }

    // --- Transacción: crear item y movimiento inicial ---
    const result = await prisma.$transaction(async (tx) => {
      // Construimos 'data' con lo mínimo (campos garantizados por tu schema)
      const data: Record<string, any> = {
        locationId: location!.id,
      };

      // Agrega SOLO si existen en tu schema (evita fallos de tipos en Prisma)
      if (typeof photoUrl === "string" && photoUrl.trim())
        data.photoUrl = photoUrl.trim();
      if (!Number.isNaN(minNum)) data.minStock = minNum;

      // (Opcionales) Si tu modelo SÍ tiene estos campos, se añadirán;
      // si no, Prisma lanzará error y lo verás en logs/alert.
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof baseUnit === "string" && baseUnit.trim())
        data.baseUnit = baseUnit.trim();

      let item;
      try {
        item = await tx.inventoryItem.create({
          data: data as any,
        });
      } catch (err: any) {
        console.error("Error creando InventoryItem:", {
          prismaError: { code: err?.code, message: err?.message },
          triedData: data,
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

    return NextResponse.json({ ok: true, item: result }, { status: 201 });
  } catch (err: any) {
    const payload = {
      error: "Error interno",
      code: err?.code ?? undefined,
      message: err?.message ?? String(err),
    };
    console.error("POST /api/inventory error:", payload);
    return NextResponse.json(payload, { status: 500 });
  }
}
