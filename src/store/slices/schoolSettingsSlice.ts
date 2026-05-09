import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/firebase";
import { getLevelsByRange, getClassKeysByRange } from "@/utils/schoolUtils";

/**
 * schoolSettingsSlice
 * - ดึงข้อมูลโรงเรียน (school-settings/{schoolId}) ครั้งเดียวตอน Login
 * - Cache ใน Redux Store → ทุกหน้าอ่านจาก Store โดยไม่ต้อง fetch ซ้ำ
 * - ข้อมูลที่เก็บ: ชื่อโรงเรียน, ผู้อำนวยการ, ระดับชั้น, โลโก้ ฯลฯ
 */

export interface SchoolSettingsState {
    // ข้อมูลพื้นฐาน
    schoolId: string;
    schoolName: string;
    schoolNameEn: string;
    logoUrl: string;
    affiliation: string;

    // ผู้บริหาร
    directorName: string;
    directorPrefix: string;
    deputyName: string;
    deputyPrefix: string;
    personnelHeadName: string;
    personnelHeadPrefix: string;

    // ระดับชั้นที่เปิดสอน
    opportunityExpansionLevel: string;
    availableClassOptions: [string, string][];  // [key, displayName][]
    classKeys: string[];  // keys เฉพาะ เช่น ['p1','p2',...]
    currentAcademicYear: string;

    // สถานะ
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
}

const initialState: SchoolSettingsState = {
    schoolId: "",
    schoolName: "",
    schoolNameEn: "",
    logoUrl: "",
    affiliation: "",

    directorName: "",
    directorPrefix: "",
    deputyName: "",
    deputyPrefix: "",
    personnelHeadName: "",
    personnelHeadPrefix: "",

    opportunityExpansionLevel: "",
    availableClassOptions: [],
    classKeys: [],
    currentAcademicYear: "",

    status: "idle",
    error: null,
};

export const fetchSchoolSettings = createAsyncThunk(
    "schoolSettings/fetch",
    async (schoolId: string, { rejectWithValue }) => {
        try {
            const schoolDocRef = doc(firestore, "school-settings", schoolId);
            const schoolDocSnap = await getDoc(schoolDocRef);

            if (!schoolDocSnap.exists()) {
                return rejectWithValue("School settings not found");
            }

            const data = schoolDocSnap.data();

            // คำนวณ availableClassOptions จาก opportunityExpansionLevel
            const level = data.opportunityExpansionLevel || "";
            const levels = getLevelsByRange(level);
            const classKeys = getClassKeysByRange(level);

            // สร้าง [key, label][] เช่น [["p1", "ป.1"], ["p2", "ป.2"]]
            const baseOptions: [string, string][] = classKeys.map((key, index) => [
                key,
                levels[index] || key
            ]);

            const availableClassOptions: [string, string][] = baseOptions;

            return {
                schoolId,
                schoolName: data.schoolName || "",
                schoolNameEn: data.schoolNameEn || "",
                logoUrl: data.logoUrl || "",
                affiliation: data.affiliation || "",

                directorName: data.directorName || "",
                directorPrefix: data.directorPrefix || "",
                deputyName: data.deputyName || "",
                deputyPrefix: data.deputyPrefix || "",
                personnelHeadName: data.personnelHeadName || "",
                personnelHeadPrefix: data.personnelHeadPrefix || "",

                opportunityExpansionLevel: level,
                availableClassOptions,
                classKeys,
                currentAcademicYear: data.currentAcademicYear || "",
            };
        } catch (error) {
            return rejectWithValue("Failed to fetch school settings");
        }
    }
);

const schoolSettingsSlice = createSlice({
    name: "schoolSettings",
    initialState,
    reducers: {
        /** อัปเดตข้อมูลบางส่วนหลังแก้ไข (ไม่ต้อง fetch ใหม่ทั้งหมด) */
        updateSchoolSettings(state, action) {
            Object.assign(state, action.payload);
        },
        resetSchoolSettings() {
            return initialState;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSchoolSettings.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchSchoolSettings.fulfilled, (state, action) => {
                state.status = "succeeded";
                Object.assign(state, action.payload);
            })
            .addCase(fetchSchoolSettings.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload as string;
            });
    },
});

export const { updateSchoolSettings, resetSchoolSettings } = schoolSettingsSlice.actions;
export default schoolSettingsSlice.reducer;
