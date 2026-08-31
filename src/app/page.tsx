export default function Home() {
  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] gap-px bg-[var(--border)] xl:grid-cols-[2fr_1fr] xl:grid-rows-1">
      <section className="bg-bg row-start-2 flex items-center justify-center p-6 xl:row-start-1">
        <p className="text-text-muted">Chart goes here — Phase 4.</p>
      </section>
      <aside className="bg-surface row-start-1 flex flex-col gap-4 p-6">
        <h1 className="text-lg">Triangle screener</h1>
        <p className="text-text-muted">
          Scaffold only. The screener panel arrives in Phase 5.
        </p>
        <p className="tabular text-2xs text-text-faint">0 / 0 pairs scanned</p>
      </aside>
    </main>
  );
}
