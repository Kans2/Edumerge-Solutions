import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import TodayPage from './pages/faculty/TodayPage';
import MarkAttendance from './pages/faculty/MarkAttendance';
import MyAttendance from './pages/student/MyAttendance';
import MyHistory from './pages/student/MyHistory';
import Sessions from './pages/Sessions';
import Defaulters from './pages/Defaulters';
import Corrections from './pages/Corrections';
import Leaves from './pages/Leaves';
import Reports from './pages/Reports';
import ExportCentre from './pages/ExportCentre';
import Administration from './pages/admin/Administration';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { ROLES } from './utils/constants';

const STAFF = [ROLES.FACULTY, ROLES.CLASS_ADVISOR, ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN];
const ADVISORS = [ROLES.CLASS_ADVISOR, ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN];
const MANAGERS = [ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN];

function Home() {
  const { isStudent } = useAuth();
  return isStudent ? <MyAttendance /> : <TodayPage />;
}

export default function App() {
  useSocket();

  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Home />} />

          {/* Student */}
          <Route path="my-history" element={<ProtectedRoute roles={[ROLES.STUDENT]}><MyHistory /></ProtectedRoute>} />
          <Route path="leaves" element={<Leaves />} />

          {/* Staff */}
          <Route path="mark/:sessionId" element={<ProtectedRoute roles={STAFF}><MarkAttendance /></ProtectedRoute>} />
          <Route path="sessions" element={<ProtectedRoute roles={STAFF}><Sessions /></ProtectedRoute>} />
          <Route path="corrections" element={<ProtectedRoute roles={STAFF}><Corrections /></ProtectedRoute>} />
          <Route path="defaulters" element={<ProtectedRoute roles={ADVISORS}><Defaulters /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute roles={MANAGERS}><Reports /></ProtectedRoute>} />
          <Route path="exports" element={<ProtectedRoute roles={STAFF}><ExportCentre /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute roles={[ROLES.ADMIN]}><Administration /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
