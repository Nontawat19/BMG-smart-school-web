import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, getDocs, setDoc, doc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore as db, auth } from '@/firebase';
import { ROUTE_REGISTRY } from '@/constants/routeRegistry';

export interface RoutePermissionEntry {
  allowedRoles: string[];
  allowedDepartments: string[];
  allowedSpecialRoles: string[];
  allowedPersonnelTypes: string[];
}

interface PermissionContextType {
  routePermissions: Record<string, RoutePermissionEntry>; // merged union (global + school)
  globalPermissions: Record<string, RoutePermissionEntry>; // global only — read-only for school admin
  schoolPermissions: Record<string, RoutePermissionEntry>; // school-specific additions only
  isLoaded: boolean;
  updateRoutePermission: (routeKey: string, entry: RoutePermissionEntry) => Promise<void>;
  batchUpdatePermissions: (updates: Record<string, RoutePermissionEntry>) => Promise<void>;
  batchUpdateSchoolPermissions: (schoolId: string, updates: Record<string, RoutePermissionEntry>) => Promise<void>;
  clearSchoolPermissions: (schoolId: string) => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType>({
  routePermissions: {},
  globalPermissions: {},
  schoolPermissions: {},
  isLoaded: false,
  updateRoutePermission: async () => {},
  batchUpdatePermissions: async () => {},
  batchUpdateSchoolPermissions: async () => {},
  clearSchoolPermissions: async () => {},
});

const parseEntry = (raw: Record<string, unknown>): RoutePermissionEntry => ({
  allowedRoles:          (raw.allowedRoles as string[])          ?? [],
  allowedDepartments:    (raw.allowedDepartments as string[])    ?? [],
  allowedSpecialRoles:   (raw.allowedSpecialRoles as string[])   ?? [],
  allowedPersonnelTypes: (raw.allowedPersonnelTypes as string[]) ?? [],
});

const isPermissionDeniedError = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code?: string }).code === 'permission-denied';

// School-specific settings take precedence for that school; otherwise fallback to global
const unionEntry = (
  global: RoutePermissionEntry | undefined,
  school: RoutePermissionEntry | undefined
): RoutePermissionEntry => {
  if (school) return school;
  return global ?? { allowedRoles: [], allowedDepartments: [], allowedSpecialRoles: [], allowedPersonnelTypes: [] };
};

export const PermissionProvider: React.FC<{
  children: React.ReactNode;
  schoolId?: string | null;
}> = ({ children, schoolId }) => {
  const [globalPerms, setGlobalPerms]   = useState<Record<string, RoutePermissionEntry>>({});
  const [schoolSpecificPerms, setSchoolSpecificPerms] = useState<Record<string, RoutePermissionEntry>>({});
  const [globalLoaded, setGlobalLoaded] = useState(false);
  const [schoolLoaded, setSchoolLoaded] = useState(false);

  const isLoaded = globalLoaded && schoolLoaded;

  // Firestore rules allow any authenticated user to read route_permissions,
  // so overrides must load for every signed-in user on every page — not just
  // admins on the permission-management screen — otherwise granted roles
  // (e.g. teacher) never take effect when that user visits the route.
  const canReadGlobalPermissionDocument = true;
  const canReadSchoolPermissions = true;

  // Union merge: global is the floor, school adds on top
  const routePermissions = useMemo(() => {
    const allKeys = new Set([...Object.keys(globalPerms), ...Object.keys(schoolSpecificPerms)]);
    const merged: Record<string, RoutePermissionEntry> = {};
    allKeys.forEach(key => {
      merged[key] = unionEntry(globalPerms[key], schoolSpecificPerms[key]);
    });
    return merged;
  }, [globalPerms, schoolSpecificPerms]);

  // Load global route_permissions
  useEffect(() => {
    if (!canReadGlobalPermissionDocument) {
      setGlobalPerms({});
      setGlobalLoaded(true);
      return;
    }

    setGlobalLoaded(false);
    const load = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'route_permissions'));
        const data: Record<string, RoutePermissionEntry> = {};
        snapshot.forEach(d => { data[d.id] = parseEntry(d.data() as Record<string, unknown>); });
        setGlobalPerms(data);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          console.warn('PermissionContext: fallback to default global route permissions because access was denied.');
          setGlobalPerms({});
        } else {
          console.error('PermissionContext: failed to load global route_permissions', err);
        }
      } finally {
        setGlobalLoaded(true);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        load();
      } else {
        setGlobalLoaded(true);
      }
    });
    return () => unsubscribe();
  }, [canReadGlobalPermissionDocument]);

  // Load school-specific permissions
  useEffect(() => {
    if (!schoolId || !canReadSchoolPermissions) {
      setSchoolSpecificPerms({});
      setSchoolLoaded(true);
      return;
    }

    setSchoolLoaded(false);
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'school-settings', schoolId, 'route_permissions'));
        const data: Record<string, RoutePermissionEntry> = {};
        snapshot.forEach(d => { data[d.id] = parseEntry(d.data() as Record<string, unknown>); });
        setSchoolSpecificPerms(data);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          console.warn('PermissionContext: fallback to default school route permissions because access was denied.');
          setSchoolSpecificPerms({});
        } else {
          console.error('PermissionContext: failed to load school route_permissions', err);
        }
      } finally {
        setSchoolLoaded(true);
      }
    })();
  }, [canReadSchoolPermissions, schoolId]);

  const updateRoutePermission = async (routeKey: string, entry: RoutePermissionEntry) => {
    await setDoc(doc(db, 'route_permissions', routeKey), {
      allowedRoles:          entry.allowedRoles,
      allowedDepartments:    entry.allowedDepartments,
      allowedSpecialRoles:   entry.allowedSpecialRoles,
      allowedPersonnelTypes: entry.allowedPersonnelTypes,
    });
    setGlobalPerms(prev => ({ ...prev, [routeKey]: entry }));
  };

  const batchUpdatePermissions = async (updates: Record<string, RoutePermissionEntry>) => {
    const batch = writeBatch(db);
    for (const [key, entry] of Object.entries(updates)) {
      batch.set(doc(db, 'route_permissions', key), {
        allowedRoles:          entry.allowedRoles,
        allowedDepartments:    entry.allowedDepartments,
        allowedSpecialRoles:   entry.allowedSpecialRoles,
        allowedPersonnelTypes: entry.allowedPersonnelTypes,
      });
    }
    await batch.commit();
    setGlobalPerms(prev => ({ ...prev, ...updates }));
  };

  const batchUpdateSchoolPermissions = async (sid: string, updates: Record<string, RoutePermissionEntry>) => {
    const batch = writeBatch(db);
    for (const [key, entry] of Object.entries(updates)) {
      batch.set(doc(db, 'school-settings', sid, 'route_permissions', key), {
        allowedRoles:          entry.allowedRoles,
        allowedDepartments:    entry.allowedDepartments,
        allowedSpecialRoles:   entry.allowedSpecialRoles,
        allowedPersonnelTypes: entry.allowedPersonnelTypes,
      });
    }
    await batch.commit();
    if (sid === schoolId) {
      setSchoolSpecificPerms(prev => ({ ...prev, ...updates }));
    }
  };

  const clearSchoolPermissions = async (sid: string) => {
    const snapshot = await getDocs(collection(db, 'school-settings', sid, 'route_permissions'));
    const batch = writeBatch(db);
    snapshot.forEach(d => batch.delete(d.ref));
    await batch.commit();
    if (sid === schoolId) {
      setSchoolSpecificPerms({});
    }
  };

  return (
    <PermissionContext.Provider value={{
      routePermissions,
      globalPermissions: globalPerms,
      schoolPermissions: schoolSpecificPerms,
      isLoaded,
      updateRoutePermission,
      batchUpdatePermissions,
      batchUpdateSchoolPermissions,
      clearSchoolPermissions,
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissionContext = () => useContext(PermissionContext);

export const useEffectiveRoles = (routeKey: string | undefined): string[] | undefined => {
  const { routePermissions, isLoaded } = usePermissionContext();
  if (!isLoaded || !routeKey) return undefined;
  const entry = ROUTE_REGISTRY.find(r => r.key === routeKey);
  if (!entry) return undefined;
  return routePermissions[routeKey] !== undefined
    ? routePermissions[routeKey].allowedRoles
    : entry.defaultRoles;
};
