import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { establishments, products, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [establishment] = await db
    .select()
    .from(establishments)
    .where(eq(establishments.slug, slug));

  if (!establishment) {
    return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      priceAmount: products.priceAmount,
      currency: products.currency,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.establishmentId, establishment.id));

  return NextResponse.json({
    establishment: {
      name: establishment.name,
      tagline: establishment.tagline,
      accentColor: establishment.accentColor,
    },
    products: rows,
  });
}
