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
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[12px] font-brand font-extrabold tracking-wide ring-1 ring-edge",
        // pastel gradient + deep monogram by hue; in dark the tile deepens and the letters lighten so logos don't glow on navy
        "bg-[linear-gradient(135deg,oklch(0.96_0.03_var(--hue)),oklch(0.9_0.06_var(--hue)))] text-[oklch(0.35_0.1_var(--hue))]",
        "dark:bg-[linear-gradient(135deg,oklch(0.4_0.07_var(--hue)),oklch(0.32_0.08_var(--hue)))] dark:text-[oklch(0.93_0.05_var(--hue))]",
        className,
      )}
      style={{ "--hue": hue, width: size, height: size, fontSize: size * 0.32 } as React.CSSProperties}
      title={name}
    >
      {letters}
    </span>
  );
}
