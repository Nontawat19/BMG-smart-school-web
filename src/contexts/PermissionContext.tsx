import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, getDocs, setDoc, doc, writeBatch } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { ROUTE_REGISTRY } from '@/constants/routeRegistry';

export interface RoutePermissionEntry {
  allowedRoles: string[];
  allowedDepartments: string[];
  allowedSpecialRoles: string[];
}

interface PermissionContextType {
  routePermissions: Record<string, RoutePermissionEntry>;
  isLoaded: boolean;
  updateRoutePermission: (routeKey: string, entry: RoutePermissionEntry) => Promise<void>;
  batchUpdatePermissions: (updates: Record<string, RoutePermissionEntry>) => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType>({
  routePermissions: {},
  isLoaded: false,
  updateRoutePermission: async () => {},
  batchUpdatePermissions: async () => {},
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routePermissions, setRoutePermissions] = useState<Record<string, RoutePermissionEntry>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'route_permissions'));
        const data: Record<string, RoutePermissionEntry> = {};
        snapshot.forEach(d => {
          const raw = d.data();
          data[d.id] = {
            allowedRoles: raw.allowedRoles ?? [],
            allowedDepartments: raw.allowedDepartments ?? [],
            allowedSpecialRoles: raw.allowedSpecialRoles ?? [],
          };
        });
        setRoutePermissions(data);
      } catch (err) {
        console.error('PermissionContext: failed to load route_permissions', err);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  const updateRoutePermission = async (routeKey: string, entry: RoutePermissionEntry) => {
    await setDoc(doc(db, 'route_permissions', routeKey), {
      allowedRoles: entry.allowedRoles,
      allowedDepartments: entry.allowedDepartments,
      allowedSpecialRoles: entry.allowedSpecialRoles,
    });
    setRoutePermissions(prev => ({ ...prev, [routeKey]: entry }));
  };

  const batchUpdatePermissions = async (updates: Record<string, RoutePermissionEntry>) => {
    const batch = writeBatch(db);
    for (const [key, entry] of Object.entries(updates)) {
      batch.set(doc(db, 'route_permissions', key), {
        allowedRoles: entry.allowedRoles,
        allowedDepartments: entry.allowedDepartments,
        allowedSpecialRoles: entry.allowedSpecialRoles,
      });
    }
    await batch.commit();
    setRoutePermissions(prev => ({ ...prev, ...updates }));
  };

  return (
    <PermissionContext.Provider value={{ routePermissions, isLoaded, updateRoutePermission, batchUpdatePermissions }}>
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
