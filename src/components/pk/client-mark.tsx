import { cn } from "@/lib/utils";

/** Client "logo" tile: tinted monogram (clients have no real logos in the catalog). */
export function ClientMark({ name, hue, size = 40, className }: { name: string; hue: number; size?: number; className?: string }) {
  const words = name
    .replace(/^(Hotel|Corporativo|Grupo|Hospital|Colegio|Residencial|Plaza|Fracc\.|Fraccionamiento|Torre|Clínica|Res\.|Emb\.)\s+/i, "")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2);
  const letters = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : (words[0] ?? name).slice(0, 2).toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-[12px] font-brand font-extrabold tracking-wide ring-1 ring-edge", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: `linear-gradient(135deg, oklch(0.96 0.03 ${hue}), oklch(0.9 0.06 ${hue}))`,
        color: `oklch(0.35 0.1 ${hue})`,
      }}
      title={name}
    >
      {letters}
    </span>
  );
}
