import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore } from '@/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  email: string | null;
  fullName: string;
  profileUrl: string;
  schoolId?: string | null;
  role: string[]; // 💡 เปลี่ยนจาก string เป็น string[]
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: true,
};

export const listenToAuthChanges = createAsyncThunk(
  'auth/listenToAuthChanges',
  async (_, thunkAPI) => {
    try {
      return new Promise<UserProfile | null>((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) {
            // 💡 ใช้ onSnapshot เพื่อให้สิทธิ์ (role) อัปเดตแบบ Real-time จาก Firestore
            const docRef = doc(firestore, 'users', user.uid);
            onSnapshot(docRef, (docSnap) => {
              if (docSnap.exists()) {
                const userData = docSnap.data();

                // 💡 จัดการ role ให้เป็น array เสมอ และแปลงเป็นตัวพิมพ์เล็กเพื่อความถูกต้อง
                let roles: string[] = [];
                if (Array.isArray(userData.role)) {
                  roles = userData.role.map(r => typeof r === 'string' ? r.toLowerCase() : '');
                } else if (typeof userData.role === 'string') {
                  roles = [userData.role.toLowerCase()];
                } else {
                  roles = ['user'];
                }

                const profile: UserProfile = {
                  uid: user.uid,
                  email: user.email,
                  fullName: userData.fullName,
                  profileUrl: userData.profileUrl,
                  schoolId: userData.schoolId,
                  role: roles,
                };
                
                // อัปเดต State ผ่าน dispatch (เพราะอยู่ใน createAsyncThunk)
                thunkAPI.dispatch(setUser(profile));
                resolve(profile);
              } else {
                thunkAPI.dispatch(setUser(null));
                resolve(null);
              }
            }, (error) => {
              console.error('Error listening to user data:', error);
              thunkAPI.dispatch(setUser(null));
              reject(error);
            });
          } else {
            thunkAPI.dispatch(setUser(null));
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('Error in listenToAuthChanges:', error);
      return thunkAPI.rejectWithValue('Failed to listen to auth changes');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserProfile | null>) {
      state.user = action.payload;
    },
    clearUser(state) {
      state.user = null;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(listenToAuthChanges.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(listenToAuthChanges.fulfilled, (state, action) => {
      state.user = action.payload;
      state.loading = false;
    });
    builder.addCase(listenToAuthChanges.rejected, (state) => {
      state.loading = false;
    });
  },
});

export const { setUser, clearUser, setLoading } = authSlice.actions;
export default authSlice.reducer;
