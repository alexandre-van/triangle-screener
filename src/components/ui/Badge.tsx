export type BadgeTone = "neutral" | "ascending" | "descending";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border text-text-muted",
  ascending: "border-border-strong text-text",
  // §9: #CA3C25 is 3.3:1 on the green and must never carry meaning alone at
  // small sizes, so the descending pill pairs the colour with a ▼ glyph.
  descending: "border-[color:var(--accent)] text-text",
};

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`text-2xs inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${TONES[tone]}`}
    >
      {tone === "descending" ? <span aria-hidden>▼</span> : null}
      {tone === "ascending" ? <span aria-hidden>▲</span> : null}
      {children}
    </span>
  );
}
