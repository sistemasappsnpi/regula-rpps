import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, Menu, X, type LucideIcon } from "lucide-react";

export interface ShellNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  locked?: boolean;
  lockedTitle?: string;
}

export interface ShellNavSection {
  label?: string;
  items: ShellNavItem[];
}

// Casca única do sistema (área do RPPS e Admin Global): menu lateral claro e discreto no desktop,
// gaveta com barra superior no celular, e conteúdo com respiro e entrada suave.
export function AppShell({
  brand,
  sections,
  footer,
  children,
}: {
  brand: { logo: string; title: string; subtitle?: string };
  sections: ShellNavSection[];
  footer: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const brandBlock = (
    <div className="flex items-center gap-3 px-2">
      <img src={brand.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-sidebar-border bg-surface object-contain p-1" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight text-sidebar-ink">{brand.title}</p>
        {brand.subtitle && <p className="truncate text-xs leading-tight text-sidebar-muted">{brand.subtitle}</p>}
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col px-4 py-5">
      {brandBlock}

      <div className="mt-7 flex-1 overflow-y-auto">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={i > 0 ? "mt-6" : ""}>
            {section.label && (
              <p className="mb-2 px-3 text-xs font-medium text-sidebar-section">{section.label}</p>
            )}
            <nav className="flex flex-col gap-1">
              {section.items.map((item) => (
                <NavItem key={item.to} item={item} />
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-sidebar-border pt-4">{footer}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg lg:flex">
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        {sidebar}
      </aside>

      {/* Celular: barra superior + gaveta */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-sidebar/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-ink hover:bg-ink/5"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <img src={brand.logo} alt="" className="h-7 w-7 rounded-lg object-contain" />
        <p className="truncate text-sm font-semibold text-sidebar-ink">{brand.title}</p>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] max-w-[85%] animate-slide-in border-r border-sidebar-border bg-sidebar shadow-lift">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted hover:bg-ink/5"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl animate-page px-5 py-6 sm:px-8 lg:px-12 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ item }: { item: ShellNavItem }) {
  const Icon = item.icon;

  if (item.locked) {
    return (
      <span
        className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-sidebar-muted/60"
        title={item.lockedTitle ?? "Não liberado para o seu usuário"}
      >
        <span className="flex items-center gap-3">
          <Icon size={18} />
          {item.label}
        </span>
        <Lock size={13} />
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
          isActive
            ? "bg-petrol/10 text-petrol"
            : "text-sidebar-muted hover:bg-ink/[0.05] hover:text-sidebar-ink"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-petrol" />}
          <Icon size={18} className="transition-transform duration-150 group-hover:scale-110" />
          {item.label}
        </>
      )}
    </NavLink>
  );
}
