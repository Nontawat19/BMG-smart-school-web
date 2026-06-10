import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '../firebase';
import { isAttendanceEntryOnly } from '@/utils/attendanceRoles';
import { isPwaStandalone, PWA_ATTENDANCE_HUB_PATH } from '@/utils/pwaMode';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // Optional: List of allowed roles
  featureFlag?: string; // Optional: Check if a specific feature is enabled
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, featureFlag }) => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFeatureEnabled, setIsFeatureEnabled] = useState(true); // Default to true until checked

  // Get user role from Redux (assuming it's loaded)
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsAuthenticated(true);

        // Check Feature Flag if provided
        if (featureFlag && user?.schoolId) {
          try {
            const schoolRef = doc(db, 'school-settings', user.schoolId);
            const schoolSnap = await getDoc(schoolRef);
            if (schoolSnap.exists() && isMounted) {
              const features = schoolSnap.data().features || {};
              // If feature is explicitly false, disable access. Default is true.
              if (features[featureFlag] === false) {
                setIsFeatureEnabled(false);
              }
            }
          } catch (error) {
            console.error("Error checking feature flag:", error);
          }
        }

      } else {
        setIsAuthenticated(false);
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

  // Role-based authorization check
  if (allowedRoles && allowedRoles.length > 0 && user && !isPwaAttendanceHub) {
    const normalizeRole = (role: unknown) => {
      if (typeof role !== 'string') return '';
      const lowerRole = role.toLowerCase();
      if (lowerRole === 'admin') return 'school_admin';
      if (lowerRole === 'academic') return 'academic_admin';
      return lowerRole;
    };

    const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
    const userRoles = rawRoles.map(normalizeRole).filter(Boolean);

    // Check if user has ANY of the allowed roles (case-insensitive check)
    const hasPermission = allowedRoles.some(role => {
      const lowerRole = normalizeRole(role);
      return userRoles.includes(lowerRole);
    });

    if (!hasPermission) {
      // User does not have permission
      console.warn(`Access denied. Required roles: ${allowedRoles}. User roles: ${userRoles}`);
      return <Navigate to="/home" replace />; // Redirect to home instead of root
    }
  }

  // Feature Flag Check
  if (!isFeatureEnabled) {
    console.warn(`Feature ${featureFlag} is disabled for school ${user?.schoolId}`);
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
