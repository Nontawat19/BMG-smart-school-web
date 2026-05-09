import React from 'react';
import { useSortable } from '@dnd-kit/sortable';

export const DroppableCourseBank: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { setNodeRef, isOver } = useSortable({ id: 'course-bank' });
    return (
        <div
            ref={setNodeRef}
            className={`h-full transition-all ${isOver ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
        >
            {children}
        </div>
    );
};
