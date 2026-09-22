import { getProductPhotoStore } from "@/lib/blobs";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = getProductPhotoStore();
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
