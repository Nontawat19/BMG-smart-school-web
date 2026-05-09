import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { firestore } from "@/firebase";

/**
 * subjectGroupsSlice
 * - ดึงข้อมูลกลุ่มสาระการเรียนรู้ (subject_groups) ครั้งเดียว
 * - Cache ใน Redux Store → ทุก dropdown/หน้าที่ใช้กลุ่มสาระอ่านจาก Store
 * - แทนที่ useSubjectGroups hook (hook ยังคงใช้ได้ แต่จะอ่านจาก Redux แทน)
 * - ข้อมูล: รายชื่อกลุ่มสาระ, สร้าง default groups อัตโนมัติถ้ายังไม่มี
 */

export interface SubjectGroup {
    id: string;
    name: string;
    code?: string;
    headTeacherId?: string;
    headTeacherName?: string;
    headId?: string;
    headName?: string;
}

export interface SubjectGroupsState {
    groups: SubjectGroup[];
    status: "idle" | "loading" | "succeeded" | "failed";
    error: string | null;
}

const DEFAULT_GROUPS = [
    { name: "ภาษาไทย", code: "1" },
    { name: "คณิตศาสตร์", code: "2" },
    { name: "วิทยาศาสตร์และเทคโนโลยี", code: "3" },
    { name: "สังคมศึกษา ศาสนา และวัฒนธรรม", code: "4" },
    { name: "สุขศึกษาและพลศึกษา", code: "5" },
    { name: "ศิลปะ", code: "6" },
    { name: "การงานอาชีพ", code: "7" },
    { name: "ภาษาต่างประเทศ", code: "8" },
    { name: "กิจกรรมพัฒนาผู้เรียน", code: "9" },
];

const initialState: SubjectGroupsState = {
    groups: [],
    status: "idle",
    error: null,
};

export const fetchSubjectGroups = createAsyncThunk(
    "subjectGroups/fetch",
    async (schoolId: string, { rejectWithValue }) => {
        try {
            const colRef = collection(
                firestore,
                "school-settings",
                schoolId,
                "subject_groups"
            );
            const snapshot = await getDocs(colRef);
            let data: SubjectGroup[] = snapshot.docs.map((d) => ({
                id: d.id,
                name: d.data().name || "",
                code: d.data().code || "",
                headTeacherId: d.data().headTeacherId || d.data().headId || "",
                headTeacherName: d.data().headTeacherName || d.data().headName || "",
                headId: d.data().headId || d.data().headTeacherId || "",
                headName: d.data().headName || d.data().headTeacherName || "",
            }));

            // สร้าง default groups ถ้ายังไม่มี (logic เดียวกับ useSubjectGroups hook)
            const existingCodes = new Set(data.map((g) => g.code));
            const missingDefaults = DEFAULT_GROUPS.filter(
                (dg) => !existingCodes.has(dg.code)
            );

            if (missingDefaults.length > 0) {
                const batch = writeBatch(firestore);
                const addedData: SubjectGroup[] = [];
                missingDefaults.forEach((item) => {
                    const newDocRef = doc(colRef);
                    batch.set(newDocRef, { name: item.name, code: item.code });
                    addedData.push({
                        id: newDocRef.id,
                        name: item.name,
                        code: item.code,
                    });
                });
                await batch.commit();
                data = [...data, ...addedData];
            }

            // เรียงตาม code
            data.sort((a, b) => {
                const codeA = parseInt(a.code || "999");
                const codeB = parseInt(b.code || "999");
                return codeA - codeB;
            });

            return data;
        } catch (error) {
            console.error("Error fetching subject groups:", error);
            // Fallback: ใช้ DEFAULT_GROUPS
            return DEFAULT_GROUPS.map((g, i) => ({
                id: `default-${i}`,
                name: g.name,
                code: g.code,
            }));
        }
    }
);

const subjectGroupsSlice = createSlice({
    name: "subjectGroups",
    initialState,
    reducers: {
        /** อัปเดตกลุ่มสาระหลังเพิ่ม/แก้ไข/ลบ (ใช้ใน SubjectGroupManagementPage) */
        setSubjectGroups(state, action) {
            state.groups = action.payload;
        },
        addSubjectGroup(state, action) {
            state.groups.push(action.payload);
            state.groups.sort((a, b) => {
                const codeA = parseInt(a.code || "999");
                const codeB = parseInt(b.code || "999");
                return codeA - codeB;
            });
        },
        updateSubjectGroup(state, action) {
            const { id, ...updates } = action.payload;
            const index = state.groups.findIndex((g) => g.id === id);
            if (index !== -1) {
                state.groups[index] = { ...state.groups[index], ...updates };
            }
        },
        removeSubjectGroup(state, action) {
            state.groups = state.groups.filter((g) => g.id !== action.payload);
        },
        resetSubjectGroups() {
            return initialState;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSubjectGroups.pending, (state) => {
                state.status = "loading";
            })
            .addCase(fetchSubjectGroups.fulfilled, (state, action) => {
                state.status = "succeeded";
                state.groups = action.payload;
            })
            .addCase(fetchSubjectGroups.rejected, (state, action) => {
                state.status = "failed";
                state.error = action.payload as string;
            });
    },
});

export const {
    setSubjectGroups,
    addSubjectGroup,
    updateSubjectGroup,
    removeSubjectGroup,
    resetSubjectGroups,
} = subjectGroupsSlice.actions;
export default subjectGroupsSlice.reducer;
