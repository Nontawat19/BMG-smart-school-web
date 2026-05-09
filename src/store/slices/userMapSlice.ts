import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/firebase";

interface Teacher {
  id: string;
  teacherId?: string;
  name: string;
  profileImageUrl?: string;
  displayName?: string;
  homeroomGrade?: string;
  uid?: string;
  isHeadOfLearningArea?: boolean;
  isHeadOfAssessment?: boolean;
  learningArea?: string;
  subjectGroup?: string;
  department?: string;
  position?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
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

export const fetchTeachersMap = createAsyncThunk(
  "userMap/fetchTeachers",
  async (schoolId: string, { rejectWithValue }) => {
    try {
      const teachersCollectionRef = collection(firestore, 'school-settings', schoolId, 'teachers');
      const teachersSnapshot = await getDocs(teachersCollectionRef);
      const teachersData: { [id: string]: Teacher } = {};
      teachersSnapshot.forEach(doc => {
        const data = doc.data();
        teachersData[doc.id] = {
          id: doc.id,
          teacherId: data.teacherId || '',
          name: `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim(),
          profileImageUrl: data.profileImageUrl || '',
          displayName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          homeroomGrade: data.homeroomGrade || '',
          uid: data.uid || '',
          isHeadOfLearningArea: data.isHeadOfLearningArea || false,
          isHeadOfAssessment: data.isHeadOfAssessment || false,
          learningArea: data.learningArea || data.subjectGroup || '',
          subjectGroup: data.subjectGroup || data.learningArea || '',
          department: data.department || '',
          position: data.position || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          title: data.title || '',
          preferences: data.preferences || {},
        };
      });
      return teachersData;
    } catch (error) {
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
