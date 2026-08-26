import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore } from '@/firebase';
import { collectionGroup, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { expandSuperAdminScopedRoles } from '@/utils/superAdminScope';
import { ROLES } from '@/constants/roles';

const areRolesEqual = (left: string[] = [], right: string[] = []) => (
  left.length === right.length && left.every((role, index) => role === right[index])
);

interface UserProfile {
  uid: string;
  email: string | null;
  fullName: string;
  profileUrl: string;
  schoolId?: string | null;
  homeSchoolId?: string | null;
  homeRole?: string[];
  role: string[];
  department?: string;
  personnelType?: 'teacher' | 'user';
  isHeadOfLearningArea?: boolean;
  isHeadOfAssessment?: boolean;
  isGuidanceTeacher?: boolean;
  isHomeroomTeacher?: boolean;
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
            if (user.isAnonymous) {
              const userType = localStorage.getItem('currentUserType') || 'student';
              const profile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                fullName: userType === 'student' ? 'นักเรียน' : 'ผู้ปกครอง',
                profileUrl: '',
                schoolId: null,
                homeSchoolId: null,
                homeRole: [userType],
                role: [userType],
              };
              thunkAPI.dispatch(setUser(profile));
              resolve(profile);
              return;
            }

            // 💡 ใช้ onSnapshot เพื่อให้สิทธิ์ (role) อัปเดตแบบ Real-time จาก Firestore
            const docRef = doc(firestore, 'users', user.uid);
            onSnapshot(docRef, async (docSnap) => {
              if (docSnap.exists()) {
                const userData = docSnap.data();

                let roles: string[] = [];
                if (Array.isArray(userData.role)) {
                  roles = userData.role.map(r => typeof r === 'string' ? r.toLowerCase() : '');
                } else if (typeof userData.role === 'string') {
                  roles = [userData.role.toLowerCase()];
                } else {
                  roles = ['user'];
                }

                // Fetch teacher-specific fields (department, special roles)
                let teacherFields: Partial<UserProfile> = {};
                if (userData.schoolId) {
                  try {
                    const teacherRef = doc(firestore, 'school-settings', userData.schoolId, 'teachers', user.uid);
                    const teacherSnap = await getDoc(teacherRef);
                    if (teacherSnap.exists()) {
                      const td = teacherSnap.data();
                      const resolvePersonnelType = (): 'teacher' | 'user' => {
                        if (td.personnelType === 'teacher' || td.personnelType === 'user') return td.personnelType;
                        const tdRoles: string[] = Array.isArray(td.role) ? td.role : typeof td.role === 'string' ? [td.role] : roles;
                        const attendanceOnly = ['student_attendance', 'teacher_attendance', 'school_attendance'];
                        if (!tdRoles.includes(ROLES.TEACHER)) return 'user';
                        if (tdRoles.length > 0 && tdRoles.every((r: string) => attendanceOnly.includes(r))) return 'user';
                        return 'teacher';
                      };
                      teacherFields = {
                        ...(td.department ? { department: td.department } : {}),
                        personnelType: resolvePersonnelType(),
                        isHeadOfLearningArea: !!td.isHeadOfLearningArea,
                        isHeadOfAssessment: !!td.isHeadOfAssessment,
                        isGuidanceTeacher: !!td.isGuidanceTeacher,
                        isHomeroomTeacher: !!td.isHomeroomTeacher,
                      };
                    }
                  } catch (_) {}
                }

                const profile: UserProfile = {
                  uid: user.uid,
                  email: user.email,
                  fullName: userData.fullName,
                  profileUrl: userData.profileUrl,
                  schoolId: userData.schoolId,
                  homeSchoolId: userData.schoolId,
                  homeRole: roles,
                  role: roles,
                  ...teacherFields,
                };

                thunkAPI.dispatch(setUser(profile));
                resolve(profile);
              } else {
                // Fallback: บัญชีเก่าที่ไม่มี users/{uid} แต่มีข้อมูลอยู่ใน school-settings/*/teachers
                // (เช่นเดียวกับ fallback ตอน login ใน LoginPage.tsx)
                try {
                  const teachersQuery = query(
                    collectionGroup(firestore, 'teachers'),
                    where('uid', '==', user.uid),
                    limit(1)
                  );
                  const teacherSnapshots = await getDocs(teachersQuery);

                  if (!teacherSnapshots.empty) {
                    const teacherDoc = teacherSnapshots.docs[0];
                    const td = teacherDoc.data();
                    const schoolId = teacherDoc.ref.parent.parent?.id || null;

                    let roles: string[] = [];
                    if (Array.isArray(td.role)) {
                      roles = td.role.map((r: any) => typeof r === 'string' ? r.toLowerCase() : '');
                    } else if (typeof td.role === 'string') {
                      roles = [td.role.toLowerCase()];
                    } else {
                      roles = ['user'];
                    }

                    const resolvedFullName = td.fullName
                      || `${td.title || ''}${td.firstName || ''} ${td.lastName || ''}`.trim()
                      || user.email
                      || '';

                    const attendanceOnly = ['student_attendance', 'teacher_attendance', 'school_attendance'];
                    const personnelType: 'teacher' | 'user' =
                      !roles.includes(ROLES.TEACHER) || (roles.length > 0 && roles.every((r) => attendanceOnly.includes(r))) ? 'user' : 'teacher';

                    const profile: UserProfile = {
                      uid: user.uid,
                      email: user.email,
                      fullName: resolvedFullName,
                      profileUrl: td.profileImageUrl || '',
                      schoolId,
                      homeSchoolId: schoolId,
                      homeRole: roles,
                      role: roles,
                      ...(td.department ? { department: td.department } : {}),
                      personnelType,
                      isHeadOfLearningArea: !!td.isHeadOfLearningArea,
                      isHeadOfAssessment: !!td.isHeadOfAssessment,
                      isGuidanceTeacher: !!td.isGuidanceTeacher,
                      isHomeroomTeacher: !!td.isHomeroomTeacher,
                    };

                    thunkAPI.dispatch(setUser(profile));
                    resolve(profile);
                    return;
                  }
                } catch (fallbackError) {
                  console.error('Error in teachers collectionGroup fallback:', fallbackError);
                }

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
    applySchoolScope(state, action: PayloadAction<string | null>) {
      if (!state.user) return;
      const roles = Array.isArray(state.user.homeRole) ? state.user.homeRole : state.user.role;
      const isSuperAdmin = roles.includes('super_admin');
      if (!isSuperAdmin) return;

      const isImpersonatingSchool = !!action.payload;
      const nextSchoolId = action.payload || state.user.homeSchoolId || null;
      const nextRoles = expandSuperAdminScopedRoles(roles, isImpersonatingSchool);

      if (state.user.schoolId === nextSchoolId && areRolesEqual(state.user.role, nextRoles)) {
        return;
      }

      state.user.schoolId = nextSchoolId;
      state.user.role = nextRoles;
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

export const { setUser, applySchoolScope, clearUser, setLoading } = authSlice.actions;
export default authSlice.reducer;
