import { useSelector } from 'react-redux';
import { ROLES, STAFF_ROLES } from '../utils/constants';

export function useAuth() {
  const user = useSelector((s) => s.auth.user);
  const can = (cap) => (user?.capabilities || []).includes(cap);
  return {
    user,
    role: user?.role,
    can,
    isStudent: user?.role === ROLES.STUDENT,
    isStaff: STAFF_ROLES.includes(user?.role),
    isAdvisor: [ROLES.CLASS_ADVISOR, ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN].includes(user?.role),
    isManager: [ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN].includes(user?.role),
    isAdmin: user?.role === ROLES.ADMIN,
  };
}
