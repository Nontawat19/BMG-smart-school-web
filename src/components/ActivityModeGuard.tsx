import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

/**
 * Blocks access to learner-activity assignment pages when activityMode === 'course-based'.
 * In course-based mode, teacher assignment is done via CourseAssignment, so these pages are irrelevant.
 */
const ActivityModeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    getDoc(doc(db, 'school-settings', schoolId))
      .then(snap => {
        const mode = snap.data()?.activityHubSettings?.activityMode ?? 'special-period';
        setBlocked(mode === 'course-based');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (blocked) {
    return <Navigate to="/academic/hub/activities" replace />;
  }

  return <>{children}</>;
};

export default ActivityModeGuard;
