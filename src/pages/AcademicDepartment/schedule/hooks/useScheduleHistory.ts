import { useState, useCallback, useRef, useEffect } from 'react';
import { Schedule, CourseInstance, MasterScheduleEntry } from '../types';

export interface ScheduleSnapshot {
    schedule: Schedule;
    schoolMasterSchedule: Record<string, MasterScheduleEntry[]>;
    availableCourseInstances: CourseInstance[];
}

export const useScheduleHistory = (
    schedule: Schedule,
    schoolMasterSchedule: Record<string, MasterScheduleEntry[]>,
    availableCourseInstances: CourseInstance[],
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>,
    setSchoolMasterSchedule: React.Dispatch<React.SetStateAction<Record<string, MasterScheduleEntry[]>>>,
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>,
    selectedTeacher: string
) => {
    const [past, setPast] = useState<ScheduleSnapshot[]>([]);
    const [future, setFuture] = useState<ScheduleSnapshot[]>([]);
    
    // Track the current state so we don't have to wait for render to take a snapshot
    const currentState = useRef<ScheduleSnapshot>({
        schedule,
        schoolMasterSchedule,
        availableCourseInstances
    });

    useEffect(() => {
        currentState.current = {
            schedule,
            schoolMasterSchedule,
            availableCourseInstances
        };
    }, [schedule, schoolMasterSchedule, availableCourseInstances]);

    // Clear history when teacher changes
    useEffect(() => {
        setPast([]);
        setFuture([]);
    }, [selectedTeacher]);

    const takeSnapshot = useCallback(() => {
        setPast(prev => {
            const newPast = [...prev, currentState.current];
            // Keep max 50 history steps
            if (newPast.length > 50) return newPast.slice(newPast.length - 50);
            return newPast;
        });
        setFuture([]);
    }, []);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        
        const previousState = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        setFuture(prev => [currentState.current, ...prev]);
        setPast(newPast);
        
        setSchedule(previousState.schedule);
        setSchoolMasterSchedule(previousState.schoolMasterSchedule);
        setAvailableCourseInstances(previousState.availableCourseInstances);
    }, [past, setSchedule, setSchoolMasterSchedule, setAvailableCourseInstances]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        
        const nextState = future[0];
        const newFuture = future.slice(1);
        
        setPast(prev => [...prev, currentState.current]);
        setFuture(newFuture);
        
        setSchedule(nextState.schedule);
        setSchoolMasterSchedule(nextState.schoolMasterSchedule);
        setAvailableCourseInstances(nextState.availableCourseInstances);
    }, [future, setSchedule, setSchoolMasterSchedule, setAvailableCourseInstances]);

    return {
        takeSnapshot,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0
    };
};
