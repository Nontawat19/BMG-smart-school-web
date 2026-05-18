import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/firebase";
import { getCurrentThaiYear } from "@/utils/dateUtils";

/**
 * calendarSlice
 * - ดึงข้อมูลปฏิทินการศึกษา (main_calendar) ครั้งเดียว
 * - Cache ใน Redux Store → ทุกหน้าที่ต้องใช้ปีการศึกษา/วันหยุดอ่านจาก Store
 * - ข้อมูล: ปีการศึกษา, เทอม, วันหยุด, วันเปิด-ปิดภาค
 */

export interface Term {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
}

export interface Holiday {
    date: string;
    description: string;
    type?: string;
}

export interface CalendarState {
    academicYear: string;           // ปีการศึกษา เช่น "2568"
    terms: Term[];                  // เทอม/ภาคเรียน
    holidays: Holiday[];            // วันหยุด
    semesterStartDate: string;      // วันเปิดภาคเรียน
    semesterEndDate: string;        // วันปิดภาคเรียน
    rawData: Record<string, any>;   // ข้อมูลดิบทั้งหมด (กรณีต้องใช้ field เพิ่ม)
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
}

const initialState: CalendarState = {
    academicYear: "",
    terms: [],
    holidays: [],
    semesterStartDate: "",
    semesterEndDate: "",
    rawData: {},
    status: "idle",
    error: null,
};

export const fetchCalendar = createAsyncThunk(
    "calendar/fetch",
    async (schoolId: string, { rejectWithValue }) => {
        try {
            const calDocRef = doc(
                firestore,
                "school-settings",
                schoolId,
                "main_calendar",
                "default"
            );
            const calDocSnap = await getDoc(calDocRef);

            if (!calDocSnap.exists()) {
                // Fallback: ใช้ปีปัจจุบัน + 543
                const currentYear = getCurrentThaiYear();
                return {
                    academicYear: String(currentYear),
                    terms: [],
                    holidays: [],
                    semesterStartDate: "",
                    semesterEndDate: "",
                    rawData: {},
                };
            }

            const data = calDocSnap.data();

            // ดึงปีการศึกษา
            const academicYear =
                data.academicYear ||
                data.year ||
                String(getCurrentThaiYear());

            // ดึงเทอม/ภาคเรียน (รองรับทั้ง Array และ Object)
            const termsData = data.terms || {};
            const terms: Term[] = Array.isArray(termsData)
                ? termsData.map((t: any, i: number) => ({
                    id: t.id || `term-${i}`,
                    name: t.name || `ภาคเรียนที่ ${i + 1}`,
                    startDate: t.startDate || "",
                    endDate: t.endDate || "",
                }))
                : Object.entries(termsData).map(([key, t]: [string, any]) => ({
                    id: key,
                    name: t.name || (key === 'term1' ? 'ภาคเรียนที่ 1' : key === 'term2' ? 'ภาคเรียนที่ 2' : key),
                    startDate: t.startDate || "",
                    endDate: t.endDate || "",
                }));

            // ดึงวันหยุด
            const holidays: Holiday[] = (data.holidays || []).map((h: any) => ({
                date: h.date || "",
                description: h.description || h.name || "",
                type: h.type || "holiday",
            }));

            return {
                academicYear,
                terms,
                holidays,
                semesterStartDate: data.semesterStartDate || data.startDate || "",
                semesterEndDate: data.semesterEndDate || data.endDate || "",
                rawData: data,
            };
        } catch (error) {
            return rejectWithValue("Failed to fetch calendar");
        }
    }
);

const calendarSlice = createSlice({
    name: "calendar",
    initialState,
    reducers: {
        updateCalendar(state, action) {
            Object.assign(state, action.payload);
        },
        resetCalendar() {
            return initialState;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCalendar.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchCalendar.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.academicYear = action.payload.academicYear;
                state.terms = action.payload.terms;
                state.holidays = action.payload.holidays;
                state.semesterStartDate = action.payload.semesterStartDate;
                state.semesterEndDate = action.payload.semesterEndDate;
                state.rawData = action.payload.rawData;
            })
            .addCase(fetchCalendar.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload as string;
            });
    },
});

export const { updateCalendar, resetCalendar } = calendarSlice.actions;
export default calendarSlice.reducer;
