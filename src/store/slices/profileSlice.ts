import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { firestore } from "@/firebase";

interface ProfileState {
  title: string;
  firstName: string;
  lastName: string;
  position: string;
  profileImageUrl: string;
  schoolLogoUrl: string;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

const initialState: ProfileState = {
  title: "",
  firstName: "",
  lastName: "",
  position: "",
  profileImageUrl: "",
  schoolLogoUrl: "",
  status: "idle",
  error: null,
};

export const fetchUserProfile = createAsyncThunk(
  "profile/fetchUserProfile",
  async (uid: string, { rejectWithValue }) => {
    try {
      const userDocRef = doc(firestore, "users", uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const schoolId = userData.schoolId;

        if (schoolId) {
          const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
          const schoolDocRef = doc(firestore, "school-settings", schoolId);

          let teacherDocSnap = await getDoc(doc(firestore, "school-settings", schoolId, "teachers", uid));

          if (!teacherDocSnap.exists()) {
            const byUidSnap = await getDocs(query(teachersRef, where("uid", "==", uid), limit(1)));
            teacherDocSnap = byUidSnap.docs[0] || teacherDocSnap;
          }

          if (!teacherDocSnap.exists() && userData.email) {
            const byEmailSnap = await getDocs(query(teachersRef, where("email", "==", userData.email), limit(1)));
            teacherDocSnap = byEmailSnap.docs[0] || teacherDocSnap;
          }

          if (!teacherDocSnap.exists() && userData.teacherId) {
            const byTeacherIdSnap = await getDocs(query(teachersRef, where("teacherId", "==", userData.teacherId), limit(1)));
            teacherDocSnap = byTeacherIdSnap.docs[0] || teacherDocSnap;
          }

          if (teacherDocSnap.exists()) {
            const teacherData = teacherDocSnap.data();
            const schoolDocSnap = await getDoc(schoolDocRef);
            const schoolData = schoolDocSnap.exists() ? schoolDocSnap.data() : {};
            return {
              title: teacherData.title || "",
              firstName: teacherData.firstName || "",
              lastName: teacherData.lastName || "",
              position: teacherData.position || "ครู",
              profileImageUrl: teacherData.profileImageUrl || "",
              schoolLogoUrl: schoolData.logoUrl || "",
            };
          }
        }
      }
      return rejectWithValue("User data not found");
    } catch (error) {
      return rejectWithValue("Error fetching user data");
    }
  }
);

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.title = action.payload.title;
        state.firstName = action.payload.firstName;
        state.lastName = action.payload.lastName;
        state.position = action.payload.position;
        state.profileImageUrl = action.payload.profileImageUrl;
        state.schoolLogoUrl = action.payload.schoolLogoUrl;
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      });
  },
});

export default profileSlice.reducer;
