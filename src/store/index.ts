import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import userMapReducer from "./slices/userMapSlice";
import profileReducer from "./slices/profileSlice";
import schoolSettingsReducer from "./slices/schoolSettingsSlice";
import periodSettingsReducer from "./slices/periodSettingsSlice";
import calendarReducer from "./slices/calendarSlice";
import subjectGroupsReducer from "./slices/subjectGroupsSlice";
import schoolScopeReducer from "./slices/schoolScopeSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    userMap: userMapReducer,
    profile: profileReducer,
    schoolSettings: schoolSettingsReducer,
    periodSettings: periodSettingsReducer,
    calendar: calendarReducer,
    subjectGroups: subjectGroupsReducer,
    schoolScope: schoolScopeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
