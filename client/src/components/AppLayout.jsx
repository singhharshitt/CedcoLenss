import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { BarChart3, Boxes, LayoutDashboard, Menu, MessageSquareText, ScanSearch, Settings, Sparkles, UploadCloud, X } from 'lucide-react';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { formatDateTime } from '../utils/format.js';
import { UploadDialog } from './UploadDialog.jsx';
import { Button, StatusBadge } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/reviews', label: 'Reviews', icon: MessageSquareText },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <ScanSearch className="size-5" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-slate-900">ReviewLens</p>
        <p className="text-[11px] text-slate-500">AI review insights</p>
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
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function DatasetPicker() {
  const { datasets, selectedId, selectDataset, dataset } = useDatasetContext();
  if (datasets.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="dataset-select" className="sr-only">
        Dataset
      </label>
      <select
        id="dataset-select"
        value={selectedId ?? ''}
        onChange={(e) => selectDataset(Number(e.target.value))}
        className="min-w-0 max-w-[14rem] truncate rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-700 sm:max-w-xs"
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

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <SidebarNav />
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <BarChart3 className="mb-1 size-4 text-brand-500" aria-hidden />
          Upload a CSV of reviews to see what customers love, what they complain about and who needs a reply.
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white px-4 py-5 shadow-xl">
            <div className="mb-8 flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="text-slate-500">
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-md p-1 text-slate-600 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <ScanSearch className="size-6 text-brand-600" aria-label="ReviewLens" />
          </div>
          <div className="min-w-0 flex-1">
            <DatasetPicker />
          </div>
          <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>
            <span className="hidden sm:inline">Upload CSV</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
