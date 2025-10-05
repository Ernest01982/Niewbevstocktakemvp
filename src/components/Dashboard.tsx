import { useState } from 'react';
import { Camera, FileText, Users, LogOut, Menu, X, Upload, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import StocktakeEntry from './StocktakeEntry';
import VarianceReports from './VarianceReports';
import UserManagement from './UserManagement';
import SyncQueue from './SyncQueue';
import BulkUpload from './BulkUpload';

type Page = 'stocktake' | 'variance' | 'users' | 'sync' | 'bulk';

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('stocktake');
  const [menuOpen, setMenuOpen] = useState(false);

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
      case 'sync':
        return true;
      case 'bulk':
      case 'variance':
        return ['manager', 'admin'].includes(profile.role);
      case 'users':
        return profile.role === 'admin';
      default:
        return false;
    }
  }

  function renderPage() {
    switch (currentPage) {
      case 'stocktake':
        return <StocktakeEntry />;
      case 'bulk':
        return <BulkUpload />;
      case 'variance':
        return <VarianceReports />;
      case 'users':
        return <UserManagement />;
      case 'sync':
        return <SyncQueue />;
      default:
        return <StocktakeEntry />;
    }
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
            </div>

            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => setCurrentPage('stocktake')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  currentPage === 'stocktake'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Camera className="w-4 h-4" />
                Stocktake
              </button>

              <button
                onClick={() => setCurrentPage('sync')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  currentPage === 'sync'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Upload className="w-4 h-4" />
                Sync Queue
              </button>

              {canAccessPage('bulk') && (
                <button
                  onClick={() => setCurrentPage('bulk')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    currentPage === 'bulk'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Bulk Upload
                </button>
              )}

              {canAccessPage('variance') && (
                <button
                  onClick={() => setCurrentPage('variance')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    currentPage === 'variance'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Variance
                </button>
              )}

              {canAccessPage('users') && (
                <button
                  onClick={() => setCurrentPage('users')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    currentPage === 'users'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Users
                </button>
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
              <button
                onClick={() => {
                  setCurrentPage('stocktake');
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                  currentPage === 'stocktake'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Camera className="w-5 h-5" />
                Stocktake
              </button>

              <button
                onClick={() => {
                  setCurrentPage('sync');
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                  currentPage === 'sync'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Upload className="w-5 h-5" />
                Sync Queue
              </button>

              {canAccessPage('bulk') && (
                <button
                  onClick={() => {
                    setCurrentPage('bulk');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    currentPage === 'bulk'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  Bulk Upload
                </button>
              )}

              {canAccessPage('variance') && (
                <button
                  onClick={() => {
                    setCurrentPage('variance');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    currentPage === 'variance'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  Variance Reports
                </button>
              )}

              {canAccessPage('users') && (
                <button
                  onClick={() => {
                    setCurrentPage('users');
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    currentPage === 'users'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  User Management
                </button>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderPage()}
      </main>
    </div>
  );
}
