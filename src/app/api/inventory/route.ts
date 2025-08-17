import { NextResponse } from "next/server";

let inventory = [
  { id: 1, name: "Lámpara LED", quantity: 10, price: 200 },
  { id: 2, name: "Cable eléctrico", quantity: 50, price: 15 },
  { id: 3, name: "Interruptor sencillo", quantity: 30, price: 40 },
];

// 📌 GET -> obtiene todo el inventario
export async function GET() {
  return NextResponse.json(inventory);
}

// 📌 POST -> agrega un nuevo producto
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newItem = {
      id: inventory.length + 1,
      ...body,
    };
    inventory.push(newItem);

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: "Error al crear el producto" },
      { status: 400 }
    );
  }
}

// 📌 PUT -> actualiza un producto
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...rest } = body;

    let itemIndex = inventory.findIndex((item) => item.id === id);

    if (itemIndex === -1) {
      return NextResponse.json(
        { message: "Producto no encontrado" },
        { status: 404 }
      );
    }

    inventory[itemIndex] = { ...inventory[itemIndex], ...rest };

    return NextResponse.json(inventory[itemIndex]);
  } catch (error) {
    return NextResponse.json(
      { message: "Error al actualizar el producto" },
      { status: 400 }
    );
  }
}

// 📌 DELETE -> elimina un producto por id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));

    const itemIndex = inventory.findIndex((item) => item.id === id);

    if (itemIndex === -1) {
      return NextResponse.json(
        { message: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const deletedItem = inventory.splice(itemIndex, 1);

    return NextResponse.json(deletedItem[0]);
  } catch (error) {
    return NextResponse.json(
      { message: "Error al eliminar el producto" },
      { status: 400 }
    );
  }
}
