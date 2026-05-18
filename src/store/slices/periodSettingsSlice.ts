import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/firebase";
import { normalizePeriodSettings } from "@/utils/scheduleDisplayUtils";

/**
 * periodSettingsSlice
 * - ดึงข้อมูลการตั้งค่าคาบเรียน (schedule_settings) ครั้งเดียว
 * - Cache ใน Redux Store → ทุกหน้าที่เกี่ยวข้องกับตารางสอนอ่านจาก Store
 * - ข้อมูล: คาบเรียนทั้งหมด, คาบที่เป็นคาบสอน
 */

export interface Period {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    isTeaching: boolean;
    isTeachingPeriod?: boolean;
    index?: number;
    order?: number;
}

export interface PeriodSettingsState {
    periods: Period[];
    teachingPeriods: Period[];  // เฉพาะคาบสอน (isTeaching: true)
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
}

const initialState: PeriodSettingsState = {
    periods: [],
    teachingPeriods: [],
    status: "idle",
    error: null,
};

export const fetchPeriodSettings = createAsyncThunk(
    "periodSettings/fetch",
    async (schoolId: string, { rejectWithValue }) => {
        try {
            const docRef = doc(
                firestore,
                "school-settings",
                schoolId,
                "configs",
                "schedule_settings"
            );
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                return { periods: [], teachingPeriods: [] };
            }

            const data = docSnap.data();
            const rawPeriods: Period[] = normalizePeriodSettings((data.periods || []).map((p: any, index: number) => ({
                id: p.id || `period-${index}`,
                label: p.label || `คาบ ${index + 1}`,
                startTime: p.startTime || "",
                endTime: p.endTime || "",
                isTeaching: p.isTeaching ?? p.isTeachingPeriod,
                isTeachingPeriod: p.isTeachingPeriod ?? p.isTeaching,
                index: p.index ?? p.order ?? index,
                order: p.order ?? p.index ?? index,
            })));

            // เรียงลำดับตาม order
            rawPeriods.sort((a, b) => (a.order || 0) - (b.order || 0));

            const teachingPeriods = rawPeriods.filter((p) => p.isTeachingPeriod || p.isTeaching);

            return {
                periods: rawPeriods,
                teachingPeriods,
            };
        } catch (error) {
            return rejectWithValue("Failed to fetch period settings");
        }
    }
);

const periodSettingsSlice = createSlice({
    name: "periodSettings",
    initialState,
    reducers: {
        /** อัปเดตคาบเรียนหลังแก้ไข (ใช้ใน PeriodSettingsPage) */
        updatePeriods(state, action) {
            const periods: Period[] = action.payload;
            const normalized = normalizePeriodSettings(periods);
            state.periods = normalized;
            state.teachingPeriods = normalized.filter((p) => p.isTeachingPeriod || p.isTeaching);
        },
        resetPeriodSettings() {
            return initialState;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPeriodSettings.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchPeriodSettings.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.periods = action.payload.periods;
                state.teachingPeriods = action.payload.teachingPeriods;
            })
            .addCase(fetchPeriodSettings.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload as string;
            });
    },
});

export const { updatePeriods, resetPeriodSettings } = periodSettingsSlice.actions;
export default periodSettingsSlice.reducer;
