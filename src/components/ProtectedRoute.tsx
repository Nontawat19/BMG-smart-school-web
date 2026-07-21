import React, { useEffect, useState, useMemo } from 'react';
import { Navigate, useLocation, matchPath } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '../firebase';
import { isAttendanceEntryOnly } from '@/utils/attendanceRoles';
import { isPwaStandalone, PWA_ATTENDANCE_HUB_PATH } from '@/utils/pwaMode';
import { usePermissionContext } from '@/contexts/PermissionContext';
import { ROUTE_REGISTRY } from '@/constants/routeRegistry';
import { ROLES } from '@/constants/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  featureFlag?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, featureFlag }) => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFeatureEnabled, setIsFeatureEnabled] = useState(true);

  const { user } = useSelector((state: RootState) => state.auth);
  const { routePermissions, isLoaded: permissionsLoaded } = usePermissionContext();

  const matchedRouteKey = useMemo(() => {
    const found = ROUTE_REGISTRY.find(r => matchPath(r.path, location.pathname) !== null);
    return found?.key;
  }, [location.pathname]);

  const matchedEntry = useMemo(() => {
    if (permissionsLoaded && matchedRouteKey && routePermissions[matchedRouteKey] !== undefined) {
      return routePermissions[matchedRouteKey];
    }
    return null;
  }, [permissionsLoaded, matchedRouteKey, routePermissions]);

  let effectiveRoles: string[] | undefined = allowedRoles;
  let effectiveDepts: string[] = [];
  let effectiveSpecialRoles: string[] = [];
  let effectivePersonnelTypes: string[] = [];
  if (matchedEntry) {
    effectiveRoles = matchedEntry.allowedRoles;
    effectiveDepts = matchedEntry.allowedDepartments;
    effectiveSpecialRoles = matchedEntry.allowedSpecialRoles;
    effectivePersonnelTypes = matchedEntry.allowedPersonnelTypes ?? [];
  }

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsAuthenticated(true);

        if (featureFlag && user?.schoolId) {
          try {
            const schoolRef = doc(db, 'school-settings', user.schoolId);
            const schoolSnap = await getDoc(schoolRef);
            if (schoolSnap.exists() && isMounted) {
              const features = schoolSnap.data().features || {};
              if (features[featureFlag] === false) {
                setIsFeatureEnabled(false);
              }
            }
          } catch (error) {
            console.error("Error checking feature flag:", error);
          }
        }

      } else {
        const userType = localStorage.getItem('currentUserType');
        const studentSessionRaw = localStorage.getItem('studentSession');
        const parentSessionRaw = localStorage.getItem('parentSession');

        if (userType === 'student' && studentSessionRaw) {
          try {
            const { schoolId, studentId } = JSON.parse(studentSessionRaw);
            if (schoolId && studentId) {
              setIsAuthenticated(true);
            } else {
              setIsAuthenticated(false);
            }
          } catch {
            localStorage.removeItem('studentSession');
            localStorage.removeItem('currentUserType');
            setIsAuthenticated(false);
          }
        } else if (userType === 'parent' && parentSessionRaw) {
          try {
            const { children } = JSON.parse(parentSessionRaw);
            if (Array.isArray(children) && children.length > 0) {
              setIsAuthenticated(true);
            } else {
              localStorage.removeItem('parentSession');
              localStorage.removeItem('currentUserType');
              setIsAuthenticated(false);
            }
          } catch {
            localStorage.removeItem('parentSession');
            localStorage.removeItem('currentUserType');
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [featureFlag, user?.schoolId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isPwaAttendanceHub = isPwaStandalone() && location.pathname === PWA_ATTENDANCE_HUB_PATH;

  const isAllowedPathForAttendanceEntry =
    location.pathname === "/attendance/checkin-out" ||
    location.pathname.startsWith("/student-support") ||
    location.pathname.includes("/students/behavior") ||
    location.pathname.includes("student-behavior-class-report") ||
    location.pathname.includes("attendance-summary") ||
    location.pathname.includes("escape-summary");

  if (
    user &&
    isAttendanceEntryOnly(user.role) &&
    !isPwaAttendanceHub &&
    !isAllowedPathForAttendanceEntry
  ) {
    return <Navigate to="/attendance/checkin-out" replace />;
  }

  if (user && !isPwaAttendanceHub) {
    const normalizeRole = (role: unknown): string => {
      if (typeof role !== 'string') return '';
      const lowerRole = role.toLowerCase();
      if (lowerRole === 'admin') return 'school_admin';
      if (lowerRole === 'academic') return 'academic_admin';
      return lowerRole;
    };

    const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
    const userRoles = rawRoles.map(normalizeRole).filter(Boolean);

    // Super Admin must never be locked out by custom route_permissions.
    if (userRoles.includes('super_admin')) {
      return <>{children}</>;
    }

    // ครูเข้าหน้าเช็คอิน/เช็คเอาท์ได้เสมอ — จำกัดแค่ลงเวลาของตัวเองเท่านั้น (บังคับอยู่แล้วใน
    // CheckinOutPage เมื่อเข้าด้วย ?mode=self) จึงปลอดภัยพอที่จะไม่ต้องพึ่งสวิตช์ตั้งค่าต่อโรงเรียน
    const hasTeacherSelfCheckinAccess = matchedRouteKey === 'checkin_out' && userRoles.includes(ROLES.TEACHER);

    const hasRoleAccess = !effectiveRoles || effectiveRoles.length === 0 ||
      effectiveRoles.some(r => userRoles.includes(normalizeRole(r))) ||
      hasTeacherSelfCheckinAccess;

    const hasDeptAccess = effectiveDepts.length > 0 &&
      !!user.department && effectiveDepts.includes(user.department);

    const hasSpecialRoleAccess = effectiveSpecialRoles.length > 0 &&
      effectiveSpecialRoles.some(sr => (user as unknown as Record<string, unknown>)[sr] === true);

    const hasPersonnelTypeAccess = effectivePersonnelTypes.length > 0 &&
      !!(user as unknown as Record<string, unknown>).personnelType &&
      effectivePersonnelTypes.includes((user as unknown as Record<string, unknown>).personnelType as string);

    if (!hasRoleAccess && !hasDeptAccess && !hasSpecialRoleAccess && !hasPersonnelTypeAccess) {
      console.warn(`Access denied. Required: roles=${effectiveRoles}, depts=${effectiveDepts}, specialRoles=${effectiveSpecialRoles}, personnelTypes=${effectivePersonnelTypes}. User: roles=${userRoles}, dept=${user.department}`);
      return <Navigate to="/home" replace />;
    }
  }

  if (!isFeatureEnabled) {
    console.warn(`Feature ${featureFlag} is disabled for school ${user?.schoolId}`);
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
