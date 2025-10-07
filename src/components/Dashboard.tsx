import { useEffect, useState, type ReactNode } from 'react';
import {
  Camera,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  LogOut,
  Menu,
  Package,
  Settings,
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

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('stocktake');
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    events,
    eventId,
    setEventId,
    warehouses,
    warehouseCode,
    setWarehouseCode
  } = useEventWarehouse();

  useEffect(() => {
    if (profile?.role === 'admin') {
      setCurrentPage((previousPage) =>
        previousPage === 'admin' ? previousPage : 'admin'
      );
    }
  }, [profile?.role]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  function canAccessPage(page: Page): boolean {
    if (!profile) return false;

    switch (page) {
      case 'stocktake':
        return true;
      case 'recounts':
      case 'sync':
        return profile.role !== 'stocktaker';
      case 'bulk':
      case 'variance':
      case 'pallet':
      case 'export':
        return ['manager', 'admin'].includes(profile.role);
      case 'users':
        return profile.role === 'admin';
      case 'admin':
        return profile.role === 'admin';
      default:
        return false;
    }
  }

  function renderPage() {
    if (!canAccessPage(currentPage)) {
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
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
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
        className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Camera className="w-8 h-8 text-blue-600" />
                <h1 className="ml-2 text-xl font-bold text-gray-800">Smart Stocktake</h1>
              </div>
              <div className="hidden md:flex items-center gap-3 ml-6">
                <select
                  value={eventId ?? ''}
                  onChange={(event) => setEventId(event.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
              {canAccessPage('recounts') && (
                <NavButton page="recounts" label="Recounts" icon={<ClipboardList className="w-4 h-4" />} />
              )}
              {canAccessPage('sync') && (
                <NavButton page="sync" label="Sync Queue" icon={<Upload className="w-4 h-4" />} />
              )}

              {canAccessPage('bulk') && (
                <NavButton page="bulk" label="Bulk Upload" icon={<FileSpreadsheet className="w-4 h-4" />} />
              )}

              {canAccessPage('pallet') && (
                <NavButton page="pallet" label="Pallet Config" icon={<Package className="w-4 h-4" />} />
              )}

              {canAccessPage('variance') && (
                <NavButton page="variance" label="Variance" icon={<FileText className="w-4 h-4" />} />
              )}

              {canAccessPage('users') && (
                <NavButton page="users" label="Users" icon={<Users className="w-4 h-4" />} />
              )}

              {canAccessPage('export') && (
                <NavButton page="export" label="Export" icon={<Download className="w-4 h-4" />} />
              )}

              {canAccessPage('admin') && (
                <NavButton page="admin" label="Admin" icon={<Settings className="w-4 h-4" />} />
              )}

              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-800">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-3 space-y-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Event
                  <select
                    value={eventId ?? ''}
                    onChange={(event) => setEventId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Warehouse
                  <select
                    value={warehouseCode ?? ''}
                    onChange={(event) => setWarehouseCode(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
              <MobileNavButton page="stocktake" label="Stocktake" icon={<Camera className="w-5 h-5" />} />
              {canAccessPage('recounts') && (
                <MobileNavButton page="recounts" label="Recounts" icon={<ClipboardList className="w-5 h-5" />} />
              )}
              {canAccessPage('sync') && (
                <MobileNavButton page="sync" label="Sync Queue" icon={<Upload className="w-5 h-5" />} />
              )}

              {canAccessPage('bulk') && (
                <MobileNavButton page="bulk" label="Bulk Upload" icon={<FileSpreadsheet className="w-5 h-5" />} />
              )}

              {canAccessPage('pallet') && (
                <MobileNavButton page="pallet" label="Pallet Config" icon={<Package className="w-5 h-5" />} />
              )}

              {canAccessPage('variance') && (
                <MobileNavButton page="variance" label="Variance" icon={<FileText className="w-5 h-5" />} />
              )}

              {canAccessPage('users') && (
                <MobileNavButton page="users" label="Users" icon={<Users className="w-5 h-5" />} />
              )}

              {canAccessPage('export') && (
                <MobileNavButton page="export" label="Export" icon={<Download className="w-5 h-5" />} />
              )}

              {canAccessPage('admin') && (
                <MobileNavButton page="admin" label="Admin" icon={<Settings className="w-5 h-5" />} />
              )}

              <div className="pt-3 border-t border-gray-200">
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-gray-800">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{renderPage()}</main>
    </div>
  );
}
