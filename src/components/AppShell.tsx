import Link from "next/link";

/**
 * Notion's page chrome: a thin sticky top bar with a breadcrumb, and a
 * centred content column at Notion's default 900px width.
 */
export function AppShell({
  breadcrumb,
  actions,
  children,
  wide = false,
  embed = false,
}: {
  breadcrumb: { label: string; href?: string; icon?: string | null }[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  /** Inside a Notion embed the breadcrumb is redundant chrome — only the
      deck's own title and the study controls are worth the vertical space. */
  embed?: boolean;
}) {
  const crumbs = embed ? breadcrumb.slice(-1) : breadcrumb;
  return (
    <div className={`flex flex-col bg-[var(--nf-bg)] ${embed ? "min-h-dvh" : "min-h-dvh"}`}>
      <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-1 border-b border-[var(--nf-border)] bg-[var(--nf-bg)]/85 px-3 backdrop-blur-sm sm:px-6">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex min-w-0 items-center gap-0.5">
              {i > 0 ? (
                <span className="px-0.5 text-[var(--nf-text-tertiary)]" aria-hidden>
                  /
                </span>
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="flex min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-[var(--nf-text-secondary)] transition-colors hover:bg-[var(--nf-hover)] hover:text-[var(--nf-text)]"
                >
                  {crumb.icon ? <span aria-hidden>{crumb.icon}</span> : null}
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5 px-1.5 py-1 font-medium">
                  {crumb.icon ? <span aria-hidden>{crumb.icon}</span> : null}
                  <span className="truncate">{crumb.label}</span>
                </span>
              )}
            </span>
          ))}
        </nav>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      <main
        className={`mx-auto w-full flex-1 px-4 sm:px-6 ${wide ? "max-w-[1100px]" : "max-w-[900px]"}`}
      >
        {children}
      </main>
    </div>
  );
}
