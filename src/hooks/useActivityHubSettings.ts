import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore as db } from '@/firebase';

export type ActivityMode = 'special-period' | 'course-based';
export type ClubMode = 'legacy' | 'course-based';

export interface ActivityHubSettings {
    /** undefined means the school has never saved a choice on /academic/activity-settings —
     * callers must NOT silently guess a mode; see isActivityModeConfigured below. */
    activityMode?: ActivityMode;
    /** clubMode has always defaulted to 'legacy' consistently across the app, so unlike
     * activityMode it's safe to resolve it to a concrete value here. */
    clubMode: ClubMode;
    disabledActivityIds: string[];
}

const SETTINGS_FIELD = 'activityHubSettings';

/**
 * Single source of truth for school-settings/{schoolId}.activityHubSettings, read live
 * (onSnapshot) so every consumer agrees with the /academic/activity-settings page the moment
 * an admin changes it — previously each page had its own getDoc/onSnapshot copy with its own
 * fallback default, and activityMode's fallback disagreed across files ('course-based' in some,
 * 'special-period' in others), so the exact same school could look mode-A in one page and
 * mode-B in another until an admin explicitly saved a choice.
 *
 * activityMode is intentionally left undefined until the school has actually chosen — which
 * mode to assume in the meantime is a per-page UX decision (block and prompt to configure,
 * or stay permissive), not something this hook should paper over with a guessed default.
 */
export const useActivityHubSettings = (schoolId: string | undefined) => {
    const [clubMode, setClubMode] = useState<ClubMode>('legacy');
    const [activityMode, setActivityMode] = useState<ActivityMode | undefined>(undefined);
    const [disabledActivityIds, setDisabledActivityIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const unsub = onSnapshot(
            doc(db, 'school-settings', schoolId),
            (snap) => {
                const raw = snap.data()?.[SETTINGS_FIELD];
                setClubMode(raw?.clubMode === 'course-based' ? 'course-based' : 'legacy');
                setActivityMode(raw?.activityMode === 'course-based' || raw?.activityMode === 'special-period' ? raw.activityMode : undefined);
                setDisabledActivityIds(Array.isArray(raw?.disabledActivityIds) ? raw.disabledActivityIds : []);
                setLoading(false);
            },
            () => setLoading(false)
        );
        return unsub;
    }, [schoolId]);

    return {
        activityMode,
        clubMode,
        disabledActivityIds,
        /** False until an admin has explicitly saved a choice on /academic/activity-settings. */
        isActivityModeConfigured: activityMode !== undefined,
        loading,
    };
};
