import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Boxes, LayoutDashboard, Menu, MessageSquareText, Settings, Sparkles, UploadCloud, X } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { formatDateTime } from '../utils/format.js';
import { UploadDialog } from './UploadDialog.jsx';
import { Button, StatusBadge } from './ui.jsx';
import { LogoMark, WaveLines } from './waves.jsx';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/reviews', label: 'Reviews', icon: MessageSquareText },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Brand({ inverted = true }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-none">
        <p className={`font-display text-xl font-bold uppercase tracking-wide ${inverted ? 'text-cream' : 'text-navy-900'}`}>ReviewLens</p>
        <p className={`mt-1 text-xs ${inverted ? 'text-navy-200' : 'text-slate-500'}`}>Review insights</p>
      </div>
    </div>
  );
}

function SidebarNav({ onNavigate }) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
              isActive ? 'bg-white/10 text-cream' : 'text-navy-200 hover:bg-white/5 hover:text-cream'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={`absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-300 transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-0'}`}
              />
              <Icon className={`size-4.5 ${isActive ? 'text-brand-300' : 'text-navy-300 group-hover:text-navy-100'}`} strokeWidth={1.75} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Navy sidebar body, shared by the desktop rail and the mobile drawer. */
function SidebarPanel({ onNavigate, onClose }) {
  return (
    <div className="on-navy relative flex h-full flex-col overflow-hidden bg-navy-900 px-4 py-6">
      <div className="flex items-center justify-between px-1">
        <Brand />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-md p-1 text-navy-200 hover:text-cream">
            <X className="size-5" />
          </button>
        )}
      </div>
      <p className="eyebrow mt-10 mb-3 px-3 text-navy-300">Workspace</p>
      <div className="flex-1">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="relative z-10 mb-12 rounded-xl border border-white/10 bg-navy-800 p-4 text-sm leading-relaxed text-navy-100">
        Upload a reviews CSV to see what customers love, what they complain about and who needs a reply.
      </div>
      <WaveLines className="h-16 text-brand-300/70" />
    </div>
  );
}

function DatasetPicker() {
  const { datasets, selectedId, selectDataset, dataset } = useDatasetContext();
  if (datasets.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <label htmlFor="dataset-select" className="sr-only">
        Dataset
      </label>
      <select
        id="dataset-select"
        value={selectedId ?? ''}
        onChange={(e) => selectDataset(Number(e.target.value))}
        className="h-10 min-w-0 max-w-[14rem] truncate rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm font-medium text-slate-800 transition-colors hover:border-navy-300 sm:max-w-xs"
      >
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            #{d.id} · {d.filename} · {formatDateTime(d.createdAt)}
          </option>
        ))}
      </select>
      {dataset && (
        <span className="hidden sm:inline-flex">
          <StatusBadge status={dataset.status} />
        </span>
      )}
    </div>
  );
}

export function AppLayout() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarPanel />
      </aside>

      {/* Mobile navigation drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-navy-950/50" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-rise shadow-xl">
            <SidebarPanel onNavigate={() => setMobileNavOpen(false)} onClose={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <LogoMark className="size-7" />
            <span className="sr-only">ReviewLens</span>
          </div>
          <div className="min-w-0 flex-1">
            <DatasetPicker />
          </div>
          <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>
            <span className="hidden sm:inline">Upload CSV</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        </header>

        {/* key: each page replays its section entrance when the route changes */}
        <main key={location.pathname} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
