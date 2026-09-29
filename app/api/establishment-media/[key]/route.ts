import { getEstablishmentMediaStore } from "@/lib/blobs";

// Public au même titre que /api/product-photo/[key] : logo et bandeau sont
// des éléments d'identité visuelle affichés à tout client, jamais des
// documents sensibles (contrairement à /api/purchase-invoice-scan/[key]).
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = getEstablishmentMediaStore();
  const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });

  const contentType = typeof result.metadata?.contentType === "string" ? result.metadata.contentType : "application/octet-stream";
  return new Response(result.data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
