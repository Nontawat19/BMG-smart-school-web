import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Schedule, CourseInstance, MasterScheduleEntry } from '../types';
import { useScheduleHistory } from '../hooks/useScheduleHistory';

interface ScheduleContextProps {
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    schoolMasterSchedule: Record<string, MasterScheduleEntry[]>;
    setSchoolMasterSchedule: React.Dispatch<React.SetStateAction<Record<string, MasterScheduleEntry[]>>>;
    availableCourseInstances: CourseInstance[];
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    selectedTeacher: string;
    setSelectedTeacher: React.Dispatch<React.SetStateAction<string>>;
    
    // History functions
    takeSnapshot: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const ScheduleContext = createContext<ScheduleContextProps | undefined>(undefined);

export const ScheduleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [schedule, setSchedule] = useState<Schedule>({});
    const [schoolMasterSchedule, setSchoolMasterSchedule] = useState<Record<string, MasterScheduleEntry[]>>({});
    const [availableCourseInstances, setAvailableCourseInstances] = useState<CourseInstance[]>([]);
    const [selectedTeacher, setSelectedTeacher] = useState<string>('');

    const { takeSnapshot, undo, redo, canUndo, canRedo } = useScheduleHistory(
        schedule,
        schoolMasterSchedule,
        availableCourseInstances,
        setSchedule,
        setSchoolMasterSchedule,
        setAvailableCourseInstances,
        selectedTeacher
    );

    return (
        <ScheduleContext.Provider value={{
            schedule, setSchedule,
            schoolMasterSchedule, setSchoolMasterSchedule,
            availableCourseInstances, setAvailableCourseInstances,
            selectedTeacher, setSelectedTeacher,
            takeSnapshot, undo, redo, canUndo, canRedo
        }}>
            {children}
        </ScheduleContext.Provider>
    );
};

export const useScheduleContext = () => {
    const context = useContext(ScheduleContext);
    if (!context) {
        throw new Error('useScheduleContext must be used within a ScheduleProvider');
    }
    return context;
};
