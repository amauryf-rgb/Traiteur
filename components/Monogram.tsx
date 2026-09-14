import { initials } from "@/lib/format";

export function Monogram({
  name,
  accentColor,
  size = 56,
  invert = false,
}: {
  name: string;
  accentColor: string | null;
  size?: number;
  invert?: boolean;
}) {
  const color = accentColor ?? "#1a1a1a";
  return (
    <div
      className="rounded-full flex items-center justify-center font-serif shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: invert ? "white" : color,
        color: invert ? color : "white",
        fontSize: size * 0.36,
      }}
    >
      {initials(name)}
    </div>
  );
}
