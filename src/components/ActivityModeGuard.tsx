import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useActivityHubSettings } from '@/hooks/useActivityHubSettings';

/**
 * Blocks access to learner-activity assignment pages when activityMode === 'course-based'.
 * In course-based mode, teacher assignment is done via CourseAssignment, so these pages are irrelevant.
 * A school that hasn't chosen a mode yet (isActivityModeConfigured === false) is NOT blocked —
 * these legacy pages stay available until the admin explicitly opts into course-based mode.
 */
const ActivityModeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const { activityMode, loading } = useActivityHubSettings(schoolId);
  const blocked = activityMode === 'course-based';

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
