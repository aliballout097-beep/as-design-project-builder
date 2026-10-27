import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-ember-300">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[32px] leading-tight tracking-tight text-ivory sm:text-[40px]">{title}</h1>
        {description ? <div className="mt-1.5 text-[14.5px] text-mist">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass edge-light rounded-3xl p-5 sm:p-6 ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
