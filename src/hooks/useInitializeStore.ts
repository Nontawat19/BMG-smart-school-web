import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import { fetchPeriodSettings } from "@/store/slices/periodSettingsSlice";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { fetchSubjectGroups } from "@/store/slices/subjectGroupsSlice";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { fetchUserProfile } from "@/store/slices/profileSlice";

/**
 * useInitializeStore
 * - เมื่อ user login สำเร็จ (มี schoolId) จะ dispatch fetch ทุก global slice ครั้งเดียว
 * - ป้องกันไม่ให้ fetch ซ้ำถ้า status ไม่ใช่ 'idle'
 * - ใช้ใน App.tsx เท่านั้น
 */
export function useInitializeStore() {
    const dispatch = useDispatch();
    const user = useSelector((state: RootState) => state.auth.user);
    const schoolSettingsStatus = useSelector((state: RootState) => state.schoolSettings.status);
    const periodSettingsStatus = useSelector((state: RootState) => state.periodSettings.status);
    const calendarStatus = useSelector((state: RootState) => state.calendar.status);
    const subjectGroupsStatus = useSelector((state: RootState) => state.subjectGroups.status);
    const teacherMapStatus = useSelector((state: RootState) => state.userMap.status);
    const profileStatus = useSelector((state: RootState) => state.profile.status);

    const schoolId = (user as any)?.schoolId;
    const uid = (user as any)?.uid;

    useEffect(() => {
        if (!schoolId) return;

        // Dispatch ทุก Slice ที่ยังไม่ได้ fetch (status === 'idle')
        if (schoolSettingsStatus === "idle") {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
        if (periodSettingsStatus === "idle") {
            dispatch(fetchPeriodSettings(schoolId) as any);
        }
        if (calendarStatus === "idle") {
            dispatch(fetchCalendar(schoolId) as any);
        }
        if (subjectGroupsStatus === "idle") {
            dispatch(fetchSubjectGroups(schoolId) as any);
        }
        if (teacherMapStatus === "idle") {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, dispatch, schoolSettingsStatus, periodSettingsStatus, calendarStatus, subjectGroupsStatus, teacherMapStatus]);

    // Profile ต้องใช้ uid
    useEffect(() => {
        if (!uid) return;
        if (profileStatus === "idle") {
            dispatch(fetchUserProfile(uid) as any);
        }
    }, [uid, dispatch, profileStatus]);
}
