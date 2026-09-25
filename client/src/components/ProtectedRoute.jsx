import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card p-8 text-center" role="alert">
        <h1 className="text-lg font-semibold text-slate-900">You do not have access to this page</h1>
        <p className="text-sm text-slate-600 mt-2">
          Your role ({user.role.replace(/_/g, ' ')}) does not include permission for this area.
        </p>
      </div>
    );
  }
  return children;
}
