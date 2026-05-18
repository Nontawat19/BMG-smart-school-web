import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/firebase";

interface Teacher {
  id: string;
  teacherId?: string;
  name: string;
  profileImageUrl?: string;
  displayName?: string;
  homeroomGrade?: string;
  homeroomRoom?: string;
  isHomeroomTeacher?: boolean;
  uid?: string;
  isHeadOfLearningArea?: boolean;
  isHeadOfAssessment?: boolean;
  isGuidanceTeacher?: boolean;
  learningArea?: string;
  subjectGroup?: string;
  department?: string;
  position?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  status?: string;
  preferences?: {
    unavailableSlots?: string[];
    unavailableDays?: string[];
  };
}

interface UserMapState {
  teachers: { [id: string]: Teacher };
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: UserMapState = {
  teachers: {},
  status: 'idle',
  error: null,
};

const STAFF_ROLES = new Set([
  'teacher',
  'school_admin',
  'academic_admin',
  'super_admin',
  'admin',
  'academic',
]);

const toRoleArray = (role: unknown): string[] => {
  if (Array.isArray(role)) {
    return role.filter((item): item is string => typeof item === 'string');
  }
  return typeof role === 'string' ? [role] : [];
};

const hasStaffRole = (role: unknown) =>
  toRoleArray(role).some(roleName => STAFF_ROLES.has(roleName.toLowerCase()));

const buildFallbackTeacherFromUser = (id: string, data: any, schoolId: string): Teacher => {
  const roles = toRoleArray(data.role);
  const isSchoolAdmin = roles.some(role => role.toLowerCase() === 'school_admin');
  const isSuperAdmin = roles.some(role => role.toLowerCase() === 'super_admin');
  const nameParts = (data.fullName || '').trim().split(/\s+/).filter(Boolean);

  const firstName = data.firstName || nameParts[0] || data.fullName || data.email || 'ไม่ระบุชื่อ';
  const lastName = data.lastName || nameParts.slice(1).join(' ');
  const title = data.title || '';

  return {
    id,
    teacherId: data.teacherId || '',
    name: `${title}${firstName} ${lastName}`.trim(),
    profileImageUrl: data.profileImageUrl || data.profileUrl || '',
    displayName: `${firstName} ${lastName}`.trim(),
    homeroomGrade: data.homeroomGrade || '',
    homeroomRoom: data.homeroomRoom || '',
    isHomeroomTeacher: data.isHomeroomTeacher || false,
    uid: data.uid || id,
    isHeadOfLearningArea: data.isHeadOfLearningArea || false,
    isHeadOfAssessment: data.isHeadOfAssessment || false,
    isGuidanceTeacher: data.isGuidanceTeacher || false,
    learningArea: data.learningArea || data.subjectGroup || '',
    subjectGroup: data.subjectGroup || data.learningArea || '',
    department: data.department || 'งานบริหารทั่วไป',
    position: data.position || (isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด' : isSchoolAdmin ? 'ผู้ดูแลระบบโรงเรียน' : 'ครู'),
    firstName,
    lastName,
    title,
    status: data.status || 'อยู่',
    preferences: data.preferences || {},
  };
};

export const fetchTeachersMap = createAsyncThunk(
  "userMap/fetchTeachers",
  async (schoolId: string, { rejectWithValue }) => {
    try {
      const teachersCollectionRef = collection(firestore, 'school-settings', schoolId, 'teachers');
      const usersCollectionRef = collection(firestore, 'users');
      const usersQuery = query(usersCollectionRef, where("schoolId", "==", schoolId));
      
      const [teachersSnapshot, usersSnapshot] = await Promise.all([
        getDocs(teachersCollectionRef),
        getDocs(usersQuery)
      ]);
      
      const teachersData: { [id: string]: Teacher } = {};
      const usersData: { [id: string]: any } = {};
      usersSnapshot.forEach(userDoc => {
        usersData[userDoc.id] = userDoc.data();
      });
      
      teachersSnapshot.forEach(doc => {
        const data = doc.data();
        const userData = usersData[doc.id] || {};
        
        const firstName = data.firstName || userData.firstName || '';
        const lastName = data.lastName || userData.lastName || '';
        const title = data.title || userData.title || '';
        const name = `${title}${firstName} ${lastName}`.trim() || userData.fullName || '';

        teachersData[doc.id] = {
          id: doc.id,
          teacherId: data.teacherId || userData.teacherId || '',
          name: name || 'ไม่ระบุชื่อ',
          profileImageUrl: data.profileImageUrl || userData.profileImageUrl || userData.profileUrl || '',
          displayName: `${firstName} ${lastName}`.trim() || userData.fullName || '',
          homeroomGrade: data.homeroomGrade || userData.homeroomGrade || '',
          homeroomRoom: data.homeroomRoom || userData.homeroomRoom || '',
          isHomeroomTeacher: data.isHomeroomTeacher || userData.isHomeroomTeacher || false,
          uid: data.uid || userData.uid || doc.id,
          isHeadOfLearningArea: data.isHeadOfLearningArea || userData.isHeadOfLearningArea || false,
          isHeadOfAssessment: data.isHeadOfAssessment || userData.isHeadOfAssessment || false,
          isGuidanceTeacher: data.isGuidanceTeacher || userData.isGuidanceTeacher || false,
          learningArea: data.learningArea || data.subjectGroup || userData.learningArea || userData.subjectGroup || '',
          subjectGroup: data.subjectGroup || data.learningArea || userData.subjectGroup || userData.learningArea || '',
          department: data.department || userData.department || '',
          position: data.position || userData.position || '',
          firstName,
          lastName,
          title,
          status: data.status || userData.status || 'อยู่',
          preferences: data.preferences || userData.preferences || {},
        };
      });

      usersSnapshot.forEach(userDoc => {
        if (teachersData[userDoc.id]) return;

        const userData = userDoc.data();
        if (!hasStaffRole(userData.role)) return;

        teachersData[userDoc.id] = buildFallbackTeacherFromUser(userDoc.id, userData, schoolId);
      });

      return teachersData;
    } catch (error) {
      console.error("Error in fetchTeachersMap:", error);
      return rejectWithValue("Failed to fetch teachers map");
    }
  }
);

const userMapSlice = createSlice({
  name: "userMap",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTeachersMap.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchTeachersMap.fulfilled, (state, action) => { state.status = 'succeeded'; state.teachers = action.payload; })
      .addCase(fetchTeachersMap.rejected, (state, action) => { state.status = 'failed'; state.error = action.payload as string; });
  },
});

export default userMapSlice.reducer;
