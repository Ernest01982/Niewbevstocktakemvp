import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../lib/supabase';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: UserRole[];
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-red-600 text-5xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You don't have permission to access this page. Required role:{' '}
            {requiredRoles.join(', ')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
