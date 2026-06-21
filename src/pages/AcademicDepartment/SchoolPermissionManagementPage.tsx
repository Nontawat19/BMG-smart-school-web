import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import MainLayout from '@/layouts/MainLayout';
import { usePermissionContext, RoutePermissionEntry } from '@/contexts/PermissionContext';
import { ROUTE_REGISTRY, ROUTE_CATEGORIES } from '@/constants/routeRegistry';
import { ROLES, ROLE_LABELS } from '@/constants/roles';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
import {
  FaShieldAlt, FaArrowLeft, FaSearch, FaCheck, FaSave, FaUndo,
  FaChevronDown, FaChevronUp, FaLock, FaUser, FaUsers, FaGraduationCap,
  FaClock, FaSchool, FaUserShield, FaCheckSquare, FaRegSquare,
  FaBriefcase, FaStar, FaIdBadge, FaInfoCircle, FaCrown, FaUserTie,
} from 'react-icons/fa';

// ─── Types ───────────────────────────────────────────────────────────────────
type AccessMode = 'roles' | 'departments' | 'special_roles' | 'personnel_types';
type RoleKey = typeof ROLES[keyof typeof ROLES];

const DEPARTMENTS = [
  'งานบริหารวิชาการ',
  'งานบริหารงบประมาณ',
  'งานบริหารบุคคล',
  'งานบริหารทั่วไป',
  'งานบริหารกิจการนักเรียน',
  'ฝ่ายบริหาร',
];

const SPECIAL_ROLES = [
  { key: 'isSubjectGroupHead', label: 'เป็นหัวหน้ากลุ่มสาระ' },
  { key: 'isAssessmentHead',   label: 'เป็นหัวหน้างานวัดและประเมินผล' },
  { key: 'isGuidanceTeacher',  label: 'เป็นครูแนะแนว' },
];

const PERSONNEL_TYPES = [
  { key: 'teacher', label: 'ครูผู้สอน', desc: 'บุคลากรที่เป็นครูผู้สอน' },
  { key: 'user',    label: 'ผู้ใช้ระบบ', desc: 'เจ้าหน้าที่ที่ไม่ใช่ครูผู้สอน' },
];

const READONLY_CATEGORIES: string[] = ['ผู้ดูแลระบบ'];

interface RoleConfig { value: RoleKey; label: string; bg: string; text: string; border: string; activeBg: string; icon: React.ReactNode; }

const ROLE_CONFIGS: RoleConfig[] = [
  { value: ROLES.SCHOOL_ADMIN,      label: ROLE_LABELS[ROLES.SCHOOL_ADMIN],      bg: 'bg-indigo-50 dark:bg-indigo-500/10',   text: 'text-indigo-700 dark:text-indigo-300',   border: 'border-indigo-200 dark:border-indigo-500/30',   activeBg: 'bg-indigo-600',  icon: <FaSchool /> },
  { value: ROLES.DIRECTOR,          label: ROLE_LABELS[ROLES.DIRECTOR],          bg: 'bg-purple-50 dark:bg-purple-500/10',   text: 'text-purple-700 dark:text-purple-300',   border: 'border-purple-200 dark:border-purple-500/30',   activeBg: 'bg-purple-600',  icon: <FaCrown /> },
  { value: ROLES.DEPT_HEAD,         label: ROLE_LABELS[ROLES.DEPT_HEAD],         bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-500/30', activeBg: 'bg-fuchsia-600', icon: <FaUserTie /> },
  { value: ROLES.ACADEMIC_ADMIN,    label: ROLE_LABELS[ROLES.ACADEMIC_ADMIN],    bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-200 dark:border-blue-500/30',       activeBg: 'bg-blue-600',    icon: <FaGraduationCap /> },
  { value: ROLES.STUDENT_AFFAIRS,   label: ROLE_LABELS[ROLES.STUDENT_AFFAIRS],   bg: 'bg-teal-50 dark:bg-teal-500/10',       text: 'text-teal-700 dark:text-teal-300',       border: 'border-teal-200 dark:border-teal-500/30',       activeBg: 'bg-teal-600',    icon: <FaUsers /> },
  { value: ROLES.TEACHER,           label: ROLE_LABELS[ROLES.TEACHER],           bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-500/30', activeBg: 'bg-emerald-600', icon: <FaUser /> },
  { value: ROLES.STUDENT_ATTENDANCE,label: ROLE_LABELS[ROLES.STUDENT_ATTENDANCE],bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-200 dark:border-amber-500/30',     activeBg: 'bg-amber-500',   icon: <FaClock /> },
  { value: ROLES.TEACHER_ATTENDANCE,label: ROLE_LABELS[ROLES.TEACHER_ATTENDANCE],bg: 'bg-orange-50 dark:bg-orange-500/10',   text: 'text-orange-700 dark:text-orange-300',   border: 'border-orange-200 dark:border-orange-500/30',   activeBg: 'bg-orange-500',  icon: <FaClock /> },
  { value: ROLES.SCHOOL_ATTENDANCE, label: ROLE_LABELS[ROLES.SCHOOL_ATTENDANCE], bg: 'bg-rose-50 dark:bg-rose-500/10',       text: 'text-rose-700 dark:text-rose-300',       border: 'border-rose-200 dark:border-rose-500/30',       activeBg: 'bg-rose-500',    icon: <FaClock /> },
  { value: ROLES.STUDENT,           label: ROLE_LABELS[ROLES.STUDENT],           bg: 'bg-sky-50 dark:bg-sky-500/10',         text: 'text-sky-700 dark:text-sky-300',         border: 'border-sky-200 dark:border-sky-500/30',         activeBg: 'bg-sky-500',     icon: <FaGraduationCap /> },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const emptyEntry = (): RoutePermissionEntry => ({
  allowedRoles: [], allowedDepartments: [], allowedSpecialRoles: [], allowedPersonnelTypes: [],
});

/** Initial state = merged (global union school) — what admin sees */
const buildInitial = (routePermissions: Record<string, RoutePermissionEntry>): Record<string, RoutePermissionEntry> => {
  const result: Record<string, RoutePermissionEntry> = {};
  for (const route of ROUTE_REGISTRY) {
    const existing = routePermissions[route.key];
    result[route.key] = {
      allowedRoles:          existing ? [...existing.allowedRoles]                  : [...route.defaultRoles],
      allowedDepartments:    existing ? [...existing.allowedDepartments]            : [],
      allowedSpecialRoles:   existing ? [...existing.allowedSpecialRoles]           : [],
      allowedPersonnelTypes: existing ? [...(existing.allowedPersonnelTypes ?? [])] : [],
    };
  }
  return result;
};

/**
 * Compute what the school has ADDED beyond global.
 * Only save additions — global roles are preserved by the union merge automatically.
 */
const computeSchoolAdditions = (
  edited: RoutePermissionEntry,
  global: RoutePermissionEntry | undefined
): RoutePermissionEntry => ({
  allowedRoles:          edited.allowedRoles.filter(r =>          !(global?.allowedRoles          ?? []).includes(r)),
  allowedDepartments:    edited.allowedDepartments.filter(d =>    !(global?.allowedDepartments    ?? []).includes(d)),
  allowedSpecialRoles:   edited.allowedSpecialRoles.filter(s =>   !(global?.allowedSpecialRoles   ?? []).includes(s)),
  allowedPersonnelTypes: edited.allowedPersonnelTypes.filter(p => !(global?.allowedPersonnelTypes ?? []).includes(p)),
});

const hasAnyAddition = (entry: RoutePermissionEntry) =>
  entry.allowedRoles.length > 0 ||
  entry.allowedDepartments.length > 0 ||
  entry.allowedSpecialRoles.length > 0 ||
  entry.allowedPersonnelTypes.length > 0;

// ─── Component ───────────────────────────────────────────────────────────────
const SchoolPermissionManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId as string | undefined;

  const {
    routePermissions, globalPermissions, schoolPermissions,
    isLoaded, batchUpdateSchoolPermissions, clearSchoolPermissions,
  } = usePermissionContext();

  const [mode, setMode]                           = useState<AccessMode>('roles');
  const [selectedRole, setSelectedRole]           = useState<RoleKey>(ROLES.SCHOOL_ADMIN);
  const [selectedDept, setSelectedDept]           = useState<string>(DEPARTMENTS[0]);
  const [selectedSpecial, setSelectedSpecial]     = useState<string>(SPECIAL_ROLES[0].key);
  const [selectedPersonnelType, setSelectedPersonnelType] = useState<string>(PERSONNEL_TYPES[0].key);
  const [editedPerms, setEditedPerms]             = useState<Record<string, RoutePermissionEntry>>({});
  const [searchQuery, setSearchQuery]             = useState('');
  const [collapsed, setCollapsed]                 = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving]                   = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (isLoaded && !initialized.current) {
      initialized.current = true;
      setEditedPerms(buildInitial(routePermissions));
    }
  }, [isLoaded, routePermissions]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const getField = (): keyof RoutePermissionEntry =>
    mode === 'roles' ? 'allowedRoles'
    : mode === 'departments' ? 'allowedDepartments'
    : mode === 'special_roles' ? 'allowedSpecialRoles'
    : 'allowedPersonnelTypes';

  const getSelected = (): string =>
    mode === 'roles' ? selectedRole
    : mode === 'departments' ? selectedDept
    : mode === 'special_roles' ? selectedSpecial
    : selectedPersonnelType;

  const isRouteChecked = (routeKey: string): boolean =>
    (editedPerms[routeKey]?.[getField()] as string[] ?? []).includes(getSelected());

  const isReadOnly = (category: string) => READONLY_CATEGORIES.includes(category);

  /** True if this selector value comes from Super Admin's global settings — cannot be removed */
  const isLockedByGlobal = (routeKey: string): boolean => {
    const globalEntry = globalPermissions[routeKey];
    if (!globalEntry) return false;
    return (globalEntry[getField()] as string[]).includes(getSelected());
  };

  /** True if route has any school-specific addition (beyond global) */
  const hasSchoolAddition = (routeKey: string): boolean => {
    const schoolEntry = schoolPermissions[routeKey];
    if (!schoolEntry) return false;
    return hasAnyAddition(schoolEntry);
  };

  const toggleRoute = (routeKey: string, category: string) => {
    if (isReadOnly(category)) return;
    if (isLockedByGlobal(routeKey)) return; // cannot remove what Super Admin granted
    const field = getField();
    const sel   = getSelected();
    setEditedPerms(prev => {
      const entry = prev[routeKey] ?? emptyEntry();
      const arr   = entry[field] as string[];
      const has   = arr.includes(sel);
      return { ...prev, [routeKey]: { ...entry, [field]: has ? arr.filter(x => x !== sel) : [...arr, sel] } };
    });
  };

  const toggleAllInCategory = (category: string, on: boolean) => {
    if (isReadOnly(category)) return;
    const field = getField();
    const sel   = getSelected();
    const routes = ROUTE_REGISTRY.filter(r => r.category === category);
    setEditedPerms(prev => {
      const next = { ...prev };
      for (const route of routes) {
        if (!on && isLockedByGlobal(route.key)) continue; // cannot uncheck global roles
        const entry = next[route.key] ?? emptyEntry();
        const arr   = entry[field] as string[];
        if (on && !arr.includes(sel))  next[route.key] = { ...entry, [field]: [...arr, sel] };
        if (!on && arr.includes(sel))  next[route.key] = { ...entry, [field]: arr.filter(x => x !== sel) };
      }
      return next;
    });
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!schoolId) {
      Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูลโรงเรียน', confirmButtonColor: '#4f46e5' });
      return;
    }

    // Compute only what the school is ADDING beyond global
    const additions: Record<string, RoutePermissionEntry> = {};
    for (const route of ROUTE_REGISTRY) {
      if (isReadOnly(route.category)) continue;
      const addition = computeSchoolAdditions(
        editedPerms[route.key] ?? emptyEntry(),
        globalPermissions[route.key]
      );
      if (hasAnyAddition(addition)) {
        additions[route.key] = addition;
      }
    }

    // Check what changed vs current school permissions
    const same = (a: string[], b: string[]) =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

    const changed: Record<string, RoutePermissionEntry> = {};
    const toRemove: string[] = [];

    // Routes with new/changed additions
    for (const [key, newAddition] of Object.entries(additions)) {
      const oldAddition = schoolPermissions[key];
      if (!oldAddition ||
          !same(newAddition.allowedRoles, oldAddition.allowedRoles) ||
          !same(newAddition.allowedDepartments, oldAddition.allowedDepartments) ||
          !same(newAddition.allowedSpecialRoles, oldAddition.allowedSpecialRoles) ||
          !same(newAddition.allowedPersonnelTypes, oldAddition.allowedPersonnelTypes ?? [])) {
        changed[key] = newAddition;
      }
    }

    // Routes where school had additions but admin removed them all
    for (const key of Object.keys(schoolPermissions)) {
      if (!additions[key]) toRemove.push(key);
    }

    if (!Object.keys(changed).length && !toRemove.length) {
      Swal.fire({ icon: 'info', title: 'ไม่มีการเปลี่ยนแปลง', confirmButtonColor: '#4f46e5' });
      return;
    }

    const totalRoutes = Object.keys(changed).length + toRemove.length;
    const result = await Swal.fire({
      title: 'ยืนยันการบันทึก',
      html: `จะอัปเดต <b>${totalRoutes}</b> หน้าสำหรับโรงเรียนนี้<br/><span style="font-size:12px;color:#6b7280">สิทธิ์ที่ Super Admin กำหนดไว้ยังคงอยู่เสมอ</span>`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5', cancelButtonColor: '#6b7280', reverseButtons: true,
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl px-6 py-2.5 font-bold', cancelButton: 'rounded-xl px-6 py-2.5 font-bold' },
    });
    if (!result.isConfirmed) return;

    setIsSaving(true);
    try {
      if (Object.keys(changed).length) {
        await batchUpdateSchoolPermissions(schoolId, changed);
      }
      // Remove additions that are now empty (admin removed all school-specific additions)
      if (toRemove.length) {
        const emptyRemovals: Record<string, RoutePermissionEntry> = {};
        toRemove.forEach(k => { emptyRemovals[k] = emptyEntry(); });
        await batchUpdateSchoolPermissions(schoolId, emptyRemovals);
      }
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: `อัปเดต ${totalRoutes} หน้าเรียบร้อย`, confirmButtonColor: '#4f46e5' });
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', confirmButtonColor: '#4f46e5' });
    } finally { setIsSaving(false); }
  };

  const handleResetToDefault = async () => {
    if (!schoolId) return;
    const result = await Swal.fire({
      title: 'รีเซ็ตสิทธิ์โรงเรียนทั้งหมด?',
      html: 'การเพิ่มเติมเฉพาะโรงเรียนจะถูกลบออก<br/><b>สิทธิ์ที่ Super Admin กำหนดไว้จะยังคงอยู่</b>',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280', reverseButtons: true,
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl px-6 py-2.5 font-bold', cancelButton: 'rounded-xl px-6 py-2.5 font-bold' },
    });
    if (!result.isConfirmed) return;
    setIsSaving(true);
    try {
      await clearSchoolPermissions(schoolId);
      initialized.current = false;
      setEditedPerms(buildInitial(routePermissions)); // re-init from global-only state
      Swal.fire({ icon: 'success', title: 'รีเซ็ตสำเร็จ', text: 'ลบการเพิ่มเติมเฉพาะโรงเรียนเรียบร้อย', confirmButtonColor: '#4f46e5' });
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', confirmButtonColor: '#4f46e5' });
    } finally { setIsSaving(false); }
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const out: Record<string, typeof ROUTE_REGISTRY> = {};
    for (const cat of ROUTE_CATEGORIES) {
      const routes = ROUTE_REGISTRY.filter(r => r.category === cat && (!q || r.label.toLowerCase().includes(q)));
      if (routes.length) out[cat] = routes;
    }
    return out;
  }, [searchQuery]);

  const countForSelector = (selector: string, field: keyof RoutePermissionEntry) =>
    ROUTE_REGISTRY.filter(r =>
      !isReadOnly(r.category) &&
      (editedPerms[r.key]?.[field] as string[] ?? (field === 'allowedRoles' ? r.defaultRoles : [])).includes(selector)
    ).length;

  const countSchoolAdded = (selector: string, field: keyof RoutePermissionEntry) =>
    ROUTE_REGISTRY.filter(r =>
      !isReadOnly(r.category) &&
      (schoolPermissions[r.key]?.[field] as string[] ?? []).includes(selector)
    ).length;

  const totalNonReadOnly = ROUTE_REGISTRY.filter(r => !isReadOnly(r.category)).length;

  const getCatStats = (cat: string) => {
    const routes = ROUTE_REGISTRY.filter(r => r.category === cat);
    return { total: routes.length, accessible: routes.filter(r => isRouteChecked(r.key)).length };
  };

  const roleConfig = ROLE_CONFIGS.find(r => r.value === selectedRole)!;
  const activeBg = mode === 'roles' ? roleConfig.activeBg
    : mode === 'departments' ? 'bg-blue-600'
    : mode === 'special_roles' ? 'bg-violet-600'
    : 'bg-emerald-600';
  const accessCount = mode === 'roles'
    ? countForSelector(selectedRole, 'allowedRoles')
    : mode === 'departments' ? countForSelector(selectedDept, 'allowedDepartments')
    : mode === 'special_roles' ? countForSelector(selectedSpecial, 'allowedSpecialRoles')
    : countForSelector(selectedPersonnelType, 'allowedPersonnelTypes');
  const schoolAddedCount = mode === 'roles'
    ? countSchoolAdded(selectedRole, 'allowedRoles')
    : mode === 'departments' ? countSchoolAdded(selectedDept, 'allowedDepartments')
    : mode === 'special_roles' ? countSchoolAdded(selectedSpecial, 'allowedSpecialRoles')
    : countSchoolAdded(selectedPersonnelType, 'allowedPersonnelTypes');
  const activeLabel = mode === 'roles' ? ROLE_LABELS[selectedRole as RoleKey]
    : mode === 'departments' ? selectedDept
    : mode === 'special_roles' ? (SPECIAL_ROLES.find(s => s.key === selectedSpecial)?.label ?? selectedSpecial)
    : (PERSONNEL_TYPES.find(p => p.key === selectedPersonnelType)?.label ?? selectedPersonnelType);

  const labelClasses = "block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1";

  if (!isLoaded) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!schoolId) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center p-8">
            <FaLock className="mx-auto text-5xl text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-xl font-black text-gray-700 dark:text-gray-300 mb-2">ไม่พบข้อมูลโรงเรียน</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">กรุณาเข้าสู่ระบบด้วยบัญชีที่ผูกกับโรงเรียน</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50/50 dark:bg-[#14141b] text-gray-900 dark:text-white transition-colors duration-300 pb-12">
        <div className="max-w-7xl mx-auto px-4 py-8">

          {/* ── Header ── */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1c1c24] rounded-2xl p-6 sm:p-10 mb-8 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full -mr-20 -mt-20" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/5 blur-[60px] rounded-full -ml-16 -mb-16" />
            <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                  <FaShieldAlt size={10} /> สิทธิ์การเข้าถึง (โรงเรียน)
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                  จัดการสิทธิ์ <span className="text-indigo-500">โรงเรียน</span>
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md font-medium">
                  เพิ่มสิทธิ์เข้าถึงได้เพิ่มเติม — สิทธิ์ที่ Super Admin กำหนดไว้จะยังคงอยู่เสมอ
                </p>
              </div>
              <Link to="/academic/hub/settings" className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 text-sm font-black transition-all hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 border border-transparent dark:border-white/5">
                <FaArrowLeft className="text-[10px] transition-transform group-hover:-translate-x-1" /> กลับการตั้งค่า
              </Link>
            </div>
          </div>

          {/* ── Union Policy Banner ── */}
          <div className="mb-6 flex items-start gap-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl px-5 py-4">
            <FaInfoCircle className="text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" size={16} />
            <div className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              <span className="font-black">นโยบายสิทธิ์:</span>{' '}
              สิทธิ์สุดท้าย = สิทธิ์ Super Admin <strong>+</strong> สิทธิ์ที่โรงเรียนเพิ่ม
              {' '}— โรงเรียนสามารถ<strong>เพิ่ม</strong>สิทธิ์ได้เท่านั้น ไม่สามารถลบสิทธิ์ที่ Super Admin ให้ไว้
              {schoolAddedCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-200 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200 text-[11px] font-black">
                  โรงเรียนเพิ่มไว้แล้ว {schoolAddedCount} หน้า
                </span>
              )}
            </div>
          </div>

          {/* ── Mode Toggle ── */}
          <div className="flex items-center gap-2 mb-6 bg-white dark:bg-[#1c1c24] rounded-2xl p-2 border border-gray-100 dark:border-white/5 shadow-sm w-fit flex-wrap">
            {([
              { id: 'roles',           label: 'สิทธิ์ (Role)',   icon: <FaShieldAlt size={12} />, active: 'bg-indigo-600' },
              { id: 'departments',     label: 'ฝ่ายงาน',         icon: <FaBriefcase size={12} />, active: 'bg-blue-600' },
              { id: 'special_roles',   label: 'บทบาทพิเศษ',      icon: <FaStar size={12} />,      active: 'bg-violet-600' },
              { id: 'personnel_types', label: 'ประเภทบุคลากร',   icon: <FaIdBadge size={12} />,   active: 'bg-emerald-600' },
            ] as { id: AccessMode; label: string; icon: React.ReactNode; active: string }[]).map(tab => (
              <button key={tab.id} onClick={() => setMode(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  mode === tab.id ? `${tab.active} text-white shadow-md` : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── Left Panel ── */}
            <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
              <div className="bg-white dark:bg-[#1c1c24] rounded-3xl p-6 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none">

                {mode === 'roles' && (
                  <>
                    <label className={labelClasses}>เลือกสิทธิ์</label>
                    <div className="space-y-2">
                      {ROLE_CONFIGS.map(rc => {
                        const cnt = countForSelector(rc.value, 'allowedRoles');
                        const added = countSchoolAdded(rc.value, 'allowedRoles');
                        const isActive = selectedRole === rc.value;
                        return (
                          <button key={rc.value} onClick={() => setSelectedRole(rc.value)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? `${rc.bg} ${rc.border} ${rc.text} border-2 shadow-sm` : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-base flex-shrink-0 ${isActive ? rc.text : 'text-gray-400 dark:text-gray-500'}`}>{rc.icon}</span>
                              <p className={`text-sm font-black truncate ${isActive ? rc.text : ''}`}>{rc.label}</p>
                            </div>
                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                              {added > 0 && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">+{added}</span>
                              )}
                              <span className={`text-xs font-black px-2.5 py-1 rounded-xl ${isActive ? `${rc.activeBg} text-white` : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                                {cnt}/{totalNonReadOnly}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
                        <FaUserShield size={10} /> Super Admin (ผู้ดูแลระบบสูงสุด) อยู่เหนือการควบคุมของโรงเรียน
                      </p>
                    </div>
                  </>
                )}

                {mode === 'departments' && (
                  <>
                    <label className={labelClasses}>เลือกฝ่ายงาน</label>
                    <div className="space-y-2">
                      {DEPARTMENTS.map(dept => {
                        const cnt = countForSelector(dept, 'allowedDepartments');
                        const isActive = selectedDept === dept;
                        return (
                          <button key={dept} onClick={() => setSelectedDept(dept)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 border-2 shadow-sm' : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <FaBriefcase className={`flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                              <p className={`text-sm font-black truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : ''}`}>{dept}</p>
                            </div>
                            <span className={`ml-2 flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-xl ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                              {cnt}/{totalNonReadOnly}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {mode === 'special_roles' && (
                  <>
                    <label className={labelClasses}>เลือกบทบาทพิเศษ</label>
                    <div className="space-y-2">
                      {SPECIAL_ROLES.map(sr => {
                        const cnt = countForSelector(sr.key, 'allowedSpecialRoles');
                        const isActive = selectedSpecial === sr.key;
                        return (
                          <button key={sr.key} onClick={() => setSelectedSpecial(sr.key)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 border-2 shadow-sm' : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <FaStar className={`flex-shrink-0 ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`} />
                              <p className={`text-sm font-black truncate ${isActive ? 'text-violet-700 dark:text-violet-300' : ''}`}>{sr.label}</p>
                            </div>
                            <span className={`ml-2 flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-xl ${isActive ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                              {cnt}/{totalNonReadOnly}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {mode === 'personnel_types' && (
                  <>
                    <label className={labelClasses}>เลือกประเภทบุคลากร</label>
                    <div className="space-y-2">
                      {PERSONNEL_TYPES.map(pt => {
                        const cnt = countForSelector(pt.key, 'allowedPersonnelTypes');
                        const isActive = selectedPersonnelType === pt.key;
                        return (
                          <button key={pt.key} onClick={() => setSelectedPersonnelType(pt.key)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 border-2 shadow-sm' : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <FaIdBadge className={`flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`} />
                              <div className="min-w-0">
                                <p className={`text-sm font-black truncate ${isActive ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{pt.label}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{pt.desc}</p>
                              </div>
                            </div>
                            <span className={`ml-2 flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-xl ${isActive ? 'bg-emerald-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                              {cnt}/{totalNonReadOnly}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Legend */}
              <div className="bg-white dark:bg-[#1c1c24] rounded-2xl p-4 border border-gray-100 dark:border-white/5 space-y-2.5">
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">สัญลักษณ์</p>
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-md bg-gray-200 dark:bg-white/10 border-2 border-gray-300 dark:border-white/20 flex items-center justify-center flex-shrink-0">
                    <FaLock size={7} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ล็อคโดย Super Admin — ไม่สามารถยกเลิกได้</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-md bg-indigo-600 border-2 border-transparent flex items-center justify-center flex-shrink-0">
                    <FaCheck size={7} className="text-white" />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">เพิ่มโดยโรงเรียน — สามารถยกเลิกได้</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">🏫</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">หน้านี้มีการเพิ่มเติมเฉพาะโรงเรียน</p>
                </div>
              </div>
            </div>

            {/* ── Right Panel ── */}
            <div className="lg:col-span-8 space-y-4">

              {/* Active selector header */}
              <div className={`rounded-3xl p-6 border-2 shadow-sm ${
                mode === 'roles' ? `${roleConfig.bg} ${roleConfig.border}`
                : mode === 'departments' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                : mode === 'special_roles' ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30'
                : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-600 dark:text-blue-400' : mode === 'special_roles' ? 'text-violet-600 dark:text-violet-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {mode === 'roles' ? roleConfig.icon : mode === 'departments' ? <FaBriefcase /> : mode === 'special_roles' ? <FaStar /> : <FaIdBadge />}
                    </span>
                    <div>
                      <p className={`text-lg font-black ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-700 dark:text-blue-300' : mode === 'special_roles' ? 'text-violet-700 dark:text-violet-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                        {activeLabel}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        เข้าถึง <span className="font-black text-gray-900 dark:text-white">{accessCount}</span>/{totalNonReadOnly} หน้า
                        {schoolAddedCount > 0 && (
                          <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-black">(โรงเรียนเพิ่ม {schoolAddedCount} หน้า)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleResetToDefault} disabled={isSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 text-sm font-black border border-gray-200 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all disabled:opacity-50">
                      <FaUndo size={11} /> ลบการเพิ่มเติม
                    </button>
                    <button onClick={handleSave} disabled={isSaving}
                      className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-black shadow-lg transition-all active:scale-95 disabled:opacity-50 ${activeBg}`}>
                      {isSaving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> บันทึก...</>
                        : <><FaSave size={12} /> บันทึก</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="bg-white dark:bg-[#1c1c24] rounded-2xl px-4 border border-gray-200 dark:border-white/5 shadow-sm">
                <div className="relative flex items-center h-12">
                  <FaSearch className="absolute left-0 text-gray-400 dark:text-gray-500 text-sm" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อหน้า..."
                    className="w-full pl-7 pr-4 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 font-medium" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-black px-2">ล้าง</button>
                  )}
                </div>
              </div>

              {/* Category groups */}
              <div className="space-y-3">
                {Object.entries(filteredGrouped).map(([category, routes]) => {
                  const { accessible } = getCatStats(category);
                  const readonly = isReadOnly(category);
                  const allOn  = routes.filter(r => !isLockedByGlobal(r.key)).every(r => isRouteChecked(r.key));
                  const noneOn = routes.every(r => !isRouteChecked(r.key));
                  const isCollapsed = collapsed.has(category);
                  return (
                    <div key={category} className={`bg-white dark:bg-[#1c1c24] rounded-2xl border shadow-sm overflow-hidden ${readonly ? 'border-gray-100 dark:border-white/5 opacity-60' : 'border-gray-100 dark:border-white/5'}`}>
                      <div className={`flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5 ${readonly ? 'bg-gray-50/50 dark:bg-white/[0.02]' : ''}`}>
                        <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(category) ? n.delete(category) : n.add(category); return n; })}
                          className="flex items-center gap-3 flex-1 text-left group">
                          <span className="text-xs font-black text-gray-700 dark:text-gray-200 uppercase tracking-wider group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{category}</span>
                          {readonly && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400">
                              <FaLock size={8} /> ระบบจัดการ
                            </span>
                          )}
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">{accessible}/{routes.length}</span>
                          {isCollapsed ? <FaChevronDown size={10} className="text-gray-400 ml-auto" /> : <FaChevronUp size={10} className="text-gray-400 ml-auto" />}
                        </button>
                        {!readonly && (
                          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                            <button onClick={() => toggleAllInCategory(category, true)} disabled={allOn}
                              className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                              <FaCheckSquare size={11} />
                            </button>
                            <button onClick={() => toggleAllInCategory(category, false)} disabled={noneOn}
                              className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                              <FaRegSquare size={11} />
                            </button>
                          </div>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                          {routes.map(route => {
                            const checked  = isRouteChecked(route.key);
                            const locked   = isLockedByGlobal(route.key);
                            const schoolAdded = hasSchoolAddition(route.key);
                            return (
                              <div key={route.key}
                                onClick={() => !readonly && !locked && toggleRoute(route.key, category)}
                                className={`flex items-center gap-4 px-5 py-3.5 transition-colors group ${
                                  readonly || locked ? 'cursor-not-allowed' : 'cursor-pointer'
                                } ${checked ? 'hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}`}>

                                {/* Checkbox */}
                                <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                  locked
                                    ? 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10'
                                    : checked
                                      ? `${activeBg} border-transparent text-white shadow-sm`
                                      : 'bg-transparent border-gray-300 dark:border-gray-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-500'
                                }`}>
                                  {locked  && <FaLock size={7} className="text-gray-400 dark:text-gray-500" />}
                                  {!locked && checked && <FaCheck size={9} />}
                                </div>

                                <span className={`text-sm font-bold flex-1 ${checked ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                                  {route.label}
                                  {locked && (
                                    <span className="ml-2 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wide">Super Admin</span>
                                  )}
                                </span>

                                {/* Indicators */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {schoolAdded && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" title="มีการเพิ่มเติมเฉพาะโรงเรียน">🏫</span>
                                  )}
                                  {(editedPerms[route.key]?.allowedDepartments?.length ?? 0) > 0 && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" title="มีการกำหนดฝ่ายงาน">
                                      <FaBriefcase size={8} />
                                    </span>
                                  )}
                                  {(editedPerms[route.key]?.allowedSpecialRoles?.length ?? 0) > 0 && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400" title="มีการกำหนดบทบาทพิเศษ">
                                      <FaStar size={8} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!Object.keys(filteredGrouped).length && (
                  <div className="bg-white dark:bg-[#1c1c24] rounded-2xl p-12 text-center border border-gray-100 dark:border-white/5 shadow-sm">
                    <FaSearch className="mx-auto text-3xl text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-bold">ไม่พบหน้าที่ตรงกับคำค้นหา</p>
                  </div>
                )}
              </div>

              {/* Sticky save bar */}
              <div className="sticky bottom-4 bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-md rounded-2xl px-6 py-4 border border-gray-200 dark:border-white/10 shadow-xl flex items-center justify-between gap-4">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 truncate">
                  <span className="font-black text-gray-900 dark:text-white">{activeLabel}</span>{' '}
                  เข้าถึงได้{' '}
                  <span className={`font-black ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-600 dark:text-blue-400' : mode === 'special_roles' ? 'text-violet-600 dark:text-violet-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {accessCount}
                  </span> / {totalNonReadOnly} หน้า
                  {schoolAddedCount > 0 && <span className="text-indigo-500 dark:text-indigo-400 font-black ml-1">(+{schoolAddedCount} โรงเรียน)</span>}
                </p>
                <button onClick={handleSave} disabled={isSaving}
                  className={`inline-flex items-center gap-2 px-6 h-[44px] rounded-2xl text-white text-sm font-black shadow-lg transition-all active:scale-95 disabled:opacity-50 flex-shrink-0 ${activeBg}`}>
                  {isSaving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> บันทึก...</>
                    : <><FaSave size={12} /> บันทึกการเปลี่ยนแปลง</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SchoolPermissionManagementPage;
