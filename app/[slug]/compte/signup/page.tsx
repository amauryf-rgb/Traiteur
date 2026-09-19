import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { SignupForm } from "./SignupForm";

export default async function ClientSignupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  return (
    <SignupForm
      slug={slug}
      establishment={{ name: establishment.name, tagline: establishment.tagline, accentColor: establishment.accentColor }}
    />
  );
}
