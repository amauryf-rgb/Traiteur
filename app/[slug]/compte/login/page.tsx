import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { LoginForm } from "./LoginForm";

export default async function ClientLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  return (
    <LoginForm
      slug={slug}
      establishment={{ name: establishment.name, tagline: establishment.tagline, accentColor: establishment.accentColor }}
    />
  );
}
