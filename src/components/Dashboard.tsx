import { useEffect, useState, type ReactNode } from 'react';
import {
  Camera,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  LogOut,
  Menu,
  Moon,
  Package,
  Settings,
  Sun,
  Upload,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEventWarehouse } from '../hooks/useEventWarehouse';
import StocktakeEntry from './StocktakeEntry';
import VarianceReports from './VarianceReports';
import UserManagement from './UserManagement';
import SyncQueue from './SyncQueue';
import BulkUpload from './BulkUpload';
import PalletConfiguration from './PalletConfiguration';
import Recounts from './Recounts';
import ExportCounts from './ExportCounts';
import AdminDashboard from './AdminDashboard';
import { useTheme } from '../hooks/useTheme';

type Page =
  | 'stocktake'
  | 'recounts'
  | 'variance'
  | 'users'
  | 'sync'
  | 'bulk'
  | 'pallet'
  | 'export'
  | 'admin';

type RoleView = 'stocktaker' | 'manager' | 'admin';

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<Page>('stocktake');
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminView, setAdminView] = useState<RoleView>('admin');
  const {
    events,
    eventId,
    setEventId,
    warehouses,
    warehouseCode,
    setWarehouseCode
  } = useEventWarehouse();

  const activeRole: RoleView =
    profile?.role === 'admin' ? adminView : (profile?.role ?? 'stocktaker');

  useEffect(() => {
    if (profile?.role === 'admin') {
      setAdminView('admin');
    }
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role !== 'admin') {
      return;
    }

    setCurrentPage((previousPage) => {
      const defaultPage: Record<RoleView, Page> = {
        stocktaker: 'stocktake',
        manager: 'stocktake',
        admin: 'admin'
      };

      return canAccessPage(previousPage, activeRole)
        ? previousPage
        : defaultPage[activeRole];
    });
  }, [activeRole, profile?.role]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  function canAccessPage(page: Page, role: RoleView): boolean {
    if (!role) return false;

    switch (page) {
      case 'stocktake':
        return true;
      case 'recounts':
      case 'sync':
        return role !== 'stocktaker';
      case 'bulk':
      case 'variance':
      case 'pallet':
      case 'export':
        return ['manager', 'admin'].includes(role);
      case 'users':
        return role === 'admin';
      case 'admin':
        return role === 'admin';
      default:
        return false;
    }
  }

  function renderPage() {
    if (!canAccessPage(currentPage, activeRole)) {
      return <StocktakeEntry />;
    }

    switch (currentPage) {
      case 'stocktake':
        return <StocktakeEntry />;
      case 'recounts':
        return <Recounts />;
      case 'bulk':
        return <BulkUpload />;
      case 'pallet':
        return <PalletConfiguration />;
      case 'variance':
        return <VarianceReports />;
      case 'users':
        return <UserManagement />;
      case 'sync':
        return <SyncQueue />;
      case 'export':
        return <ExportCounts />;
      case 'admin':
        return <AdminDashboard />;
      default:
        return <StocktakeEntry />;
    }
  }

  function NavButton({
    page,
    label,
    icon
  }: {
    page: Page;
    label: string;
    icon: ReactNode;
  }) {
    const isActive = currentPage === page;
    return (
      <button
        onClick={() => setCurrentPage(page)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
            : 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  }

  function MobileNavButton({
    page,
    label,
    icon
  }: {
    page: Page;
    label: string;
    icon: ReactNode;
  }) {
    const isActive = currentPage === page;
    return (
      <button
        onClick={() => {
          setCurrentPage(page);
          setMenuOpen(false);
        }}
        className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
            : 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm transition-colors duration-300 dark:bg-slate-900 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Camera className="w-8 h-8 text-blue-600" />
                <h1 className="ml-2 text-xl font-bold text-gray-800 dark:text-white">Smart Stocktake</h1>
              </div>
              <div className="hidden md:flex items-center gap-3 ml-6">
                <select
                  value={eventId ?? ''}
                  onChange={(event) => setEventId(event.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/50"
                >
                  <option value="" disabled>
                    Select event
                  </option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
                <select
                  value={warehouseCode ?? ''}
                  onChange={(event) => setWarehouseCode(event.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/50"
                >
                  <option value="" disabled>
                    Select warehouse
                  </option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.code} value={warehouse.code}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <NavButton page="stocktake" label="Stocktake" icon={<Camera className="w-4 h-4" />} />
              {canAccessPage('recounts', activeRole) && (
                <NavButton page="recounts" label="Recounts" icon={<ClipboardList className="w-4 h-4" />} />
              )}
              {canAccessPage('sync', activeRole) && (
                <NavButton page="sync" label="Sync Queue" icon={<Upload className="w-4 h-4" />} />
              )}

              {canAccessPage('bulk', activeRole) && (
                <NavButton page="bulk" label="Bulk Upload" icon={<FileSpreadsheet className="w-4 h-4" />} />
              )}

              {canAccessPage('pallet', activeRole) && (
                <NavButton page="pallet" label="Pallet Config" icon={<Package className="w-4 h-4" />} />
              )}

              {canAccessPage('variance', activeRole) && (
                <NavButton page="variance" label="Variance" icon={<FileText className="w-4 h-4" />} />
              )}

              {canAccessPage('users', activeRole) && (
                <NavButton page="users" label="Users" icon={<Users className="w-4 h-4" />} />
              )}

              {canAccessPage('export', activeRole) && (
                <NavButton page="export" label="Export" icon={<Download className="w-4 h-4" />} />
              )}

              {canAccessPage('admin', activeRole) && (
                <NavButton page="admin" label="Admin" icon={<Settings className="w-4 h-4" />} />
              )}

              {profile?.role === 'admin' && (
                <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    View as
                  </span>
                  <div className="flex rounded-lg border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
                    {(['stocktaker', 'manager', 'admin'] as RoleView[]).map((roleOption) => {
                      const isSelected = adminView === roleOption;
                      return (
                        <button
                          key={roleOption}
                          onClick={() => setAdminView(roleOption)}
                          className={`px-3 py-1 text-sm font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                              : 'text-gray-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700'
                          }`}
                          type="button"
                        >
                          {roleOption}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                type="button"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200 dark:border-slate-800">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize dark:text-slate-400">{profile?.role}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
              type="button"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white transition-colors dark:border-slate-800 dark:bg-slate-900">
            <div className="px-4 py-3 space-y-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Event
                  <select
                    value={eventId ?? ''}
                    onChange={(event) => setEventId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/50"
                  >
                    <option value="" disabled>
                      Select event
                    </option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Warehouse
                  <select
                    value={warehouseCode ?? ''}
                    onChange={(event) => setWarehouseCode(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/50"
                  >
                    <option value="" disabled>
                      Select warehouse
                    </option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.code} value={warehouse.code}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {profile?.role === 'admin' && (
                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    View as
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(['stocktaker', 'manager', 'admin'] as RoleView[]).map((roleOption) => {
                      const isSelected = adminView === roleOption;
                      return (
                        <button
                          key={roleOption}
                          onClick={() => setAdminView(roleOption)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                          type="button"
                        >
                          {roleOption}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <MobileNavButton page="stocktake" label="Stocktake" icon={<Camera className="w-5 h-5" />} />
              {canAccessPage('recounts', activeRole) && (
                <MobileNavButton page="recounts" label="Recounts" icon={<ClipboardList className="w-5 h-5" />} />
              )}
              {canAccessPage('sync', activeRole) && (
                <MobileNavButton page="sync" label="Sync Queue" icon={<Upload className="w-5 h-5" />} />
              )}

              {canAccessPage('bulk', activeRole) && (
                <MobileNavButton page="bulk" label="Bulk Upload" icon={<FileSpreadsheet className="w-5 h-5" />} />
              )}

              {canAccessPage('pallet', activeRole) && (
                <MobileNavButton page="pallet" label="Pallet Config" icon={<Package className="w-5 h-5" />} />
              )}

              {canAccessPage('variance', activeRole) && (
                <MobileNavButton page="variance" label="Variance" icon={<FileText className="w-5 h-5" />} />
              )}

              {canAccessPage('users', activeRole) && (
                <MobileNavButton page="users" label="Users" icon={<Users className="w-5 h-5" />} />
              )}

              {canAccessPage('export', activeRole) && (
                <MobileNavButton page="export" label="Export" icon={<Download className="w-5 h-5" />} />
              )}

              {canAccessPage('admin', activeRole) && (
                <MobileNavButton page="admin" label="Admin" icon={<Settings className="w-5 h-5" />} />
              )}

              <div className="pt-3 border-t border-gray-200">
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize dark:text-slate-400">{profile?.role}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:hover:bg-red-500/10 dark:focus-visible:ring-offset-slate-900"
                  type="button"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
                <button
                  onClick={toggleTheme}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                  type="button"
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  {isDarkMode ? 'Light mode' : 'Dark mode'}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300">
        {renderPage()}
      </main>
    </div>
  );
}
