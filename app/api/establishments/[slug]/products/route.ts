import { NextRequest, NextResponse } from "next/server";
import { products, categories } from "@/lib/db/schema";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) {
    return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });
  }
  const { establishment, context } = tenant;

  const rows = await runAsTenant(context, (tx) =>
    tx
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
      .where(eq(products.establishmentId, establishment.id))
  );

  return NextResponse.json({
    establishment: {
      name: establishment.name,
      tagline: establishment.tagline,
      accentColor: establishment.accentColor,
    },
    products: rows,
  });
}
