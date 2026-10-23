// Shared top bar for every non-live view: back link + title, styled after the
// live Header (same height, blur, border) so navigation feels like one app.
export default function HistoryShell({ title, back = "#/history", children }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/70 px-5 backdrop-blur-xl backdrop-saturate-150">
        <a
          href={back}
          className="text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </a>
        <span className="text-[15px] font-bold tracking-tight text-foreground">{title}</span>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
