import { ProHeader, type ProNavKey } from "./ProHeader";

export function ProShell({
  slug,
  establishment,
  staffName,
  isOwner,
  active,
  children,
}: {
  slug: string;
  establishment: { name: string; accentColor: string | null };
  staffName: string;
  isOwner: boolean;
  active: ProNavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <ProHeader slug={slug} establishment={establishment} staffName={staffName} isOwner={isOwner} active={active} />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

export function ProPanel({ children }: { children: React.ReactNode }) {
  return <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">{children}</div>;
}
