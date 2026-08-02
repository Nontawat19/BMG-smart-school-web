import { createSlice, PayloadAction } from "@reduxjs/toolkit";

const STORAGE_KEY = "activeSchoolScope";

interface PersistedSchoolScope {
  activeSchoolId?: string;
  activeSchoolName?: string;
}

export interface SchoolScopeState {
  activeSchoolId: string | null;
  activeSchoolName: string | null;
}

const readInitialState = (): SchoolScopeState => {
  if (typeof window === "undefined") {
    return { activeSchoolId: null, activeSchoolName: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeSchoolId: null, activeSchoolName: null };

    const parsed = JSON.parse(raw) as PersistedSchoolScope;
    return {
      activeSchoolId: parsed.activeSchoolId || null,
      activeSchoolName: parsed.activeSchoolName || null,
    };
  } catch {
    return { activeSchoolId: null, activeSchoolName: null };
  }
};

const persistState = (state: SchoolScopeState) => {
  if (typeof window === "undefined") return;

  if (!state.activeSchoolId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeSchoolId: state.activeSchoolId,
      activeSchoolName: state.activeSchoolName,
    })
  );
};

const initialState: SchoolScopeState = readInitialState();

const schoolScopeSlice = createSlice({
  name: "schoolScope",
  initialState,
  reducers: {
    setActiveSchoolScope(
      state,
      action: PayloadAction<{ schoolId: string; schoolName?: string | null }>
    ) {
      state.activeSchoolId = action.payload.schoolId;
      state.activeSchoolName = action.payload.schoolName || null;
      persistState(state);
    },
    clearActiveSchoolScope(state) {
      state.activeSchoolId = null;
      state.activeSchoolName = null;
      persistState(state);
    },
  },
});

export const { setActiveSchoolScope, clearActiveSchoolScope } = schoolScopeSlice.actions;
export default schoolScopeSlice.reducer;
