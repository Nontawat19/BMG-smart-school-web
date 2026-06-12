import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import { usePermissionContext, RoutePermissionEntry } from '@/contexts/PermissionContext';
import { ROUTE_REGISTRY, ROUTE_CATEGORIES } from '@/constants/routeRegistry';
import { ROLES, ROLE_LABELS } from '@/constants/roles';
import Swal from 'sweetalert2';
import {
  FaShieldAlt, FaArrowLeft, FaSearch, FaCheck, FaSave, FaUndo,
  FaChevronDown, FaChevronUp, FaLock, FaUser, FaUsers, FaGraduationCap,
  FaClock, FaSchool, FaUserShield, FaCheckSquare, FaRegSquare, FaBriefcase, FaStar,
} from 'react-icons/fa';

// ─── Types ───────────────────────────────────────────────────────────────────
type AccessMode = 'roles' | 'departments' | 'special_roles';
type RoleKey = typeof ROLES[keyof typeof ROLES];

// ─── Constants ───────────────────────────────────────────────────────────────
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

interface RoleConfig { value: RoleKey; label: string; bg: string; text: string; border: string; activeBg: string; icon: React.ReactNode; }
const ROLE_CONFIGS: RoleConfig[] = [
  { value: ROLES.SUPER_ADMIN,       label: ROLE_LABELS[ROLES.SUPER_ADMIN],       bg: 'bg-violet-50 dark:bg-violet-500/10',  text: 'text-violet-700 dark:text-violet-300',   border: 'border-violet-200 dark:border-violet-500/30',   activeBg: 'bg-violet-600',  icon: <FaUserShield /> },
  { value: ROLES.SCHOOL_ADMIN,      label: ROLE_LABELS[ROLES.SCHOOL_ADMIN],      bg: 'bg-indigo-50 dark:bg-indigo-500/10',  text: 'text-indigo-700 dark:text-indigo-300',   border: 'border-indigo-200 dark:border-indigo-500/30',   activeBg: 'bg-indigo-600',  icon: <FaSchool /> },
  { value: ROLES.ACADEMIC_ADMIN,    label: ROLE_LABELS[ROLES.ACADEMIC_ADMIN],    bg: 'bg-blue-50 dark:bg-blue-500/10',      text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-200 dark:border-blue-500/30',       activeBg: 'bg-blue-600',    icon: <FaGraduationCap /> },
  { value: ROLES.STUDENT_AFFAIRS,   label: ROLE_LABELS[ROLES.STUDENT_AFFAIRS],   bg: 'bg-teal-50 dark:bg-teal-500/10',      text: 'text-teal-700 dark:text-teal-300',       border: 'border-teal-200 dark:border-teal-500/30',       activeBg: 'bg-teal-600',    icon: <FaUsers /> },
  { value: ROLES.TEACHER,           label: ROLE_LABELS[ROLES.TEACHER],           bg: 'bg-emerald-50 dark:bg-emerald-500/10',text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-500/30', activeBg: 'bg-emerald-600', icon: <FaUser /> },
  { value: ROLES.STUDENT_ATTENDANCE,label: ROLE_LABELS[ROLES.STUDENT_ATTENDANCE],bg: 'bg-amber-50 dark:bg-amber-500/10',    text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-200 dark:border-amber-500/30',     activeBg: 'bg-amber-500',   icon: <FaClock /> },
  { value: ROLES.TEACHER_ATTENDANCE,label: ROLE_LABELS[ROLES.TEACHER_ATTENDANCE],bg: 'bg-orange-50 dark:bg-orange-500/10',  text: 'text-orange-700 dark:text-orange-300',   border: 'border-orange-200 dark:border-orange-500/30',   activeBg: 'bg-orange-500',  icon: <FaClock /> },
  { value: ROLES.SCHOOL_ATTENDANCE, label: ROLE_LABELS[ROLES.SCHOOL_ATTENDANCE], bg: 'bg-rose-50 dark:bg-rose-500/10',      text: 'text-rose-700 dark:text-rose-300',       border: 'border-rose-200 dark:border-rose-500/30',       activeBg: 'bg-rose-500',    icon: <FaClock /> },
  { value: ROLES.STUDENT,           label: ROLE_LABELS[ROLES.STUDENT],           bg: 'bg-sky-50 dark:bg-sky-500/10',        text: 'text-sky-700 dark:text-sky-300',         border: 'border-sky-200 dark:border-sky-500/30',         activeBg: 'bg-sky-500',     icon: <FaGraduationCap /> },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const emptyEntry = (): RoutePermissionEntry => ({ allowedRoles: [], allowedDepartments: [], allowedSpecialRoles: [] });

const buildInitial = (routePermissions: Record<string, RoutePermissionEntry>): Record<string, RoutePermissionEntry> => {
  const result: Record<string, RoutePermissionEntry> = {};
  for (const route of ROUTE_REGISTRY) {
    const existing = routePermissions[route.key];
    result[route.key] = {
      allowedRoles:        existing ? [...existing.allowedRoles]        : [...route.defaultRoles],
      allowedDepartments:  existing ? [...existing.allowedDepartments]  : [],
      allowedSpecialRoles: existing ? [...existing.allowedSpecialRoles] : [],
    };
  }
  return result;
};

// ─── Component ───────────────────────────────────────────────────────────────
const PermissionManagementPage: React.FC = () => {
  const { routePermissions, isLoaded, batchUpdatePermissions } = usePermissionContext();

  const [mode, setMode]               = useState<AccessMode>('roles');
  const [selectedRole, setSelectedRole]   = useState<RoleKey>(ROLES.SCHOOL_ADMIN);
  const [selectedDept, setSelectedDept]   = useState<string>(DEPARTMENTS[0]);
  const [selectedSpecial, setSelectedSpecial] = useState<string>(SPECIAL_ROLES[0].key);
  const [editedPerms, setEditedPerms] = useState<Record<string, RoutePermissionEntry>>({});
  const [searchQuery, setSearchQuery]     = useState('');
  const [collapsed, setCollapsed]         = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving]           = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (isLoaded && !initialized.current) {
      initialized.current = true;
      setEditedPerms(buildInitial(routePermissions));
    }
  }, [isLoaded, routePermissions]);

  // ── toggle helpers ──────────────────────────────────────────────────────────
  const getField = (): keyof RoutePermissionEntry =>
    mode === 'roles' ? 'allowedRoles' : mode === 'departments' ? 'allowedDepartments' : 'allowedSpecialRoles';

  const getSelected = (): string =>
    mode === 'roles' ? selectedRole : mode === 'departments' ? selectedDept : selectedSpecial;

  const isRouteChecked = (routeKey: string): boolean => {
    const entry = editedPerms[routeKey] ?? emptyEntry();
    return (entry[getField()] as string[]).includes(getSelected());
  };

  const toggleRoute = (routeKey: string) => {
    const field = getField();
    const sel   = getSelected();
    setEditedPerms(prev => {
      const entry  = prev[routeKey] ?? emptyEntry();
      const arr    = entry[field] as string[];
      const has    = arr.includes(sel);
      return { ...prev, [routeKey]: { ...entry, [field]: has ? arr.filter(x => x !== sel) : [...arr, sel] } };
    });
  };

  const toggleAllInCategory = (category: string, on: boolean) => {
    const field = getField();
    const sel   = getSelected();
    const routes = ROUTE_REGISTRY.filter(r => r.category === category);
    setEditedPerms(prev => {
      const next = { ...prev };
      for (const route of routes) {
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
    const changed: Record<string, RoutePermissionEntry> = {};
    for (const route of ROUTE_REGISTRY) {
      const edited   = editedPerms[route.key] ?? emptyEntry();
      const original = routePermissions[route.key] ?? { allowedRoles: route.defaultRoles, allowedDepartments: [], allowedSpecialRoles: [] };
      const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      if (!same(edited.allowedRoles, original.allowedRoles) ||
          !same(edited.allowedDepartments, original.allowedDepartments) ||
          !same(edited.allowedSpecialRoles, original.allowedSpecialRoles)) {
        changed[route.key] = edited;
      }
    }
    if (!Object.keys(changed).length) {
      Swal.fire({ icon: 'info', title: 'ไม่มีการเปลี่ยนแปลง', confirmButtonColor: '#4f46e5' });
      return;
    }
    const result = await Swal.fire({
      title: 'ยืนยันการบันทึก',
      text: `จะอัปเดตสิทธิ์ ${Object.keys(changed).length} หน้า`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5', cancelButtonColor: '#6b7280', reverseButtons: true,
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl px-6 py-2.5 font-bold', cancelButton: 'rounded-xl px-6 py-2.5 font-bold' },
    });
    if (!result.isConfirmed) return;
    setIsSaving(true);
    try {
      await batchUpdatePermissions(changed);
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: `อัปเดต ${Object.keys(changed).length} หน้าเรียบร้อย`, confirmButtonColor: '#4f46e5' });
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', confirmButtonColor: '#4f46e5' });
    } finally { setIsSaving(false); }
  };

  const handleResetToDefault = async () => {
    const result = await Swal.fire({
      title: 'รีเซ็ตสิทธิ์ทั้งหมดกลับ Default?',
      text: 'ทุกหน้าจะถูกรีเซ็ตเป็นค่าเริ่มต้นของระบบทันที',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'รีเซ็ตและบันทึก', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280', reverseButtons: true,
      customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl px-6 py-2.5 font-bold', cancelButton: 'rounded-xl px-6 py-2.5 font-bold' },
    });
    if (!result.isConfirmed) return;
    setIsSaving(true);
    try {
      const reset: Record<string, RoutePermissionEntry> = {};
      for (const route of ROUTE_REGISTRY) {
        reset[route.key] = { allowedRoles: [...route.defaultRoles], allowedDepartments: [], allowedSpecialRoles: [] };
      }
      await batchUpdatePermissions(reset);
      setEditedPerms(reset);
      Swal.fire({ icon: 'success', title: 'รีเซ็ตสำเร็จ', confirmButtonColor: '#4f46e5' });
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
    ROUTE_REGISTRY.filter(r => (editedPerms[r.key]?.[field] as string[] ?? (field === 'allowedRoles' ? r.defaultRoles : [])).includes(selector)).length;

  const getCatStats = (cat: string) => {
    const routes = ROUTE_REGISTRY.filter(r => r.category === cat);
    return { total: routes.length, accessible: routes.filter(r => isRouteChecked(r.key)).length };
  };

  // ── active role config ────────────────────────────────────────────────────
  const roleConfig = ROLE_CONFIGS.find(r => r.value === selectedRole)!;
  const activeBg = mode === 'roles' ? roleConfig.activeBg
    : mode === 'departments' ? 'bg-indigo-600' : 'bg-violet-600';
  const accessCount = mode === 'roles'
    ? countForSelector(selectedRole, 'allowedRoles')
    : mode === 'departments'
      ? countForSelector(selectedDept, 'allowedDepartments')
      : countForSelector(selectedSpecial, 'allowedSpecialRoles');
  const activeLabel = mode === 'roles' ? ROLE_LABELS[selectedRole]
    : mode === 'departments' ? selectedDept
    : SPECIAL_ROLES.find(s => s.key === selectedSpecial)?.label ?? selectedSpecial;

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
                  <FaShieldAlt size={10} /> Permission Management
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                  จัดการสิทธิ์ <span className="text-indigo-500">การเข้าถึงหน้า</span>
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md font-medium">
                  กำหนดการเข้าถึงด้วย 3 วิธี: ตามสิทธิ์ (Role) / ตามฝ่ายงาน / ตามบทบาทพิเศษ
                </p>
              </div>
              <Link to="/owner/hub" className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 text-sm font-black transition-all hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 border border-transparent dark:border-white/5">
                <FaArrowLeft className="text-[10px] transition-transform group-hover:-translate-x-1" /> กลับ Owner Hub
              </Link>
            </div>
          </div>

          {/* ── Mode Toggle ── */}
          <div className="flex items-center gap-2 mb-6 bg-white dark:bg-[#1c1c24] rounded-2xl p-2 border border-gray-100 dark:border-white/5 shadow-sm w-fit">
            {([
              { id: 'roles',         label: 'สิทธิ์ (Role)',     icon: <FaShieldAlt size={12} />,  active: 'bg-indigo-600' },
              { id: 'departments',   label: 'ฝ่ายงาน',           icon: <FaBriefcase size={12} />,  active: 'bg-blue-600' },
              { id: 'special_roles', label: 'บทบาทพิเศษ',        icon: <FaStar size={12} />,       active: 'bg-violet-600' },
            ] as { id: AccessMode; label: string; icon: React.ReactNode; active: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  mode === tab.id
                    ? `${tab.active} text-white shadow-md`
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── Left Panel ── */}
            <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
              <div className="bg-white dark:bg-[#1c1c24] rounded-3xl p-6 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none">

                {/* Roles mode */}
                {mode === 'roles' && (
                  <>
                    <label className={labelClasses}>เลือกสิทธิ์</label>
                    <div className="space-y-2">
                      {ROLE_CONFIGS.map(rc => {
                        const cnt = countForSelector(rc.value, 'allowedRoles');
                        const isActive = selectedRole === rc.value;
                        return (
                          <button key={rc.value} onClick={() => setSelectedRole(rc.value)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left ${isActive ? `${rc.bg} ${rc.border} ${rc.text} border-2 shadow-sm` : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-base flex-shrink-0 ${isActive ? rc.text : 'text-gray-400 dark:text-gray-500'}`}>{rc.icon}</span>
                              <p className={`text-sm font-black truncate ${isActive ? rc.text : ''}`}>{rc.label}</p>
                            </div>
                            <span className={`ml-2 flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-xl ${isActive ? `${rc.activeBg} text-white` : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                              {cnt}/{ROUTE_REGISTRY.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Departments mode */}
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
                              {cnt}/{ROUTE_REGISTRY.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Special Roles mode */}
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
                              {cnt}/{ROUTE_REGISTRY.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 p-4 rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20">
                      <p className="text-xs text-violet-700 dark:text-violet-300 font-bold leading-relaxed">
                        บทบาทพิเศษเป็นฟิลด์ boolean บนข้อมูลบุคลากร (เช่น <code className="bg-white/50 dark:bg-white/10 px-1 rounded">isSubjectGroupHead: true</code>)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Info box */}
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-100 dark:border-amber-900/20">
                <h4 className="inline-flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-400 uppercase tracking-widest mb-2">
                  <FaLock size={10} /> ตรรกะการเข้าถึง
                </h4>
                <p className="text-xs text-amber-800/70 dark:text-amber-200/50 leading-relaxed font-medium">
                  ผู้ใช้เข้าหน้าได้ถ้าตรงกับ <strong>สิทธิ์ หรือ ฝ่ายงาน หรือ บทบาทพิเศษ</strong> อย่างน้อยหนึ่งข้อ (OR logic)
                </p>
              </div>
            </div>

            {/* ── Right Panel ── */}
            <div className="lg:col-span-8 space-y-4">

              {/* Active selector header */}
              <div className={`rounded-3xl p-6 border-2 shadow-sm ${
                mode === 'roles'
                  ? `${roleConfig.bg} ${roleConfig.border}`
                  : mode === 'departments'
                    ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                    : 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-600 dark:text-blue-400' : 'text-violet-600 dark:text-violet-400'}`}>
                      {mode === 'roles' ? roleConfig.icon : mode === 'departments' ? <FaBriefcase /> : <FaStar />}
                    </span>
                    <div>
                      <p className={`text-lg font-black ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-700 dark:text-blue-300' : 'text-violet-700 dark:text-violet-300'}`}>
                        {activeLabel}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        เข้าถึงได้ <span className="font-black text-gray-900 dark:text-white">{accessCount}</span> จาก <span className="font-black text-gray-900 dark:text-white">{ROUTE_REGISTRY.length}</span> หน้า
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleResetToDefault} disabled={isSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 text-sm font-black border border-gray-200 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all disabled:opacity-50">
                      <FaUndo size={11} /> รีเซ็ต Default
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
                  const allOn   = routes.every(r => isRouteChecked(r.key));
                  const noneOn  = routes.every(r => !isRouteChecked(r.key));
                  const isCollapsed = collapsed.has(category);
                  return (
                    <div key={category} className="bg-white dark:bg-[#1c1c24] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5">
                        <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(category) ? n.delete(category) : n.add(category); return n; })}
                          className="flex items-center gap-3 flex-1 text-left group">
                          <span className="text-xs font-black text-gray-700 dark:text-gray-200 uppercase tracking-wider group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{category}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">{accessible}/{routes.length}</span>
                          {isCollapsed ? <FaChevronDown size={10} className="text-gray-400 ml-auto" /> : <FaChevronUp size={10} className="text-gray-400 ml-auto" />}
                        </button>
                        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                          <button onClick={() => toggleAllInCategory(category, true)} disabled={allOn}
                            className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all" title="เลือกทั้งหมด">
                            <FaCheckSquare size={11} />
                          </button>
                          <button onClick={() => toggleAllInCategory(category, false)} disabled={noneOn}
                            className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all" title="ยกเลิกทั้งหมด">
                            <FaRegSquare size={11} />
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                          {routes.map(route => {
                            const checked = isRouteChecked(route.key);
                            // default state for this mode
                            const defVal = mode === 'roles'
                              ? route.defaultRoles.includes(selectedRole)
                              : false;
                            const changed = checked !== defVal;
                            return (
                              <div key={route.key} onClick={() => toggleRoute(route.key)}
                                className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors group ${checked ? 'hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}`}>
                                <div className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${checked ? `${activeBg} border-transparent text-white shadow-sm` : 'bg-transparent border-gray-300 dark:border-gray-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-500'}`}>
                                  {checked && <FaCheck size={9} />}
                                </div>
                                <span className={`text-sm font-bold flex-1 ${checked ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{route.label}</span>

                                {/* Show which other access types are enabled for this route */}
                                <div className="flex items-center gap-1 flex-shrink-0">
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

                                {changed && (
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${checked ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/10 text-red-500 dark:text-red-400'}`}>
                                    {checked ? '+ เพิ่ม' : '− ลบ'}
                                  </span>
                                )}
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

              {/* Sticky bottom save bar */}
              <div className="sticky bottom-4 bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-md rounded-2xl px-6 py-4 border border-gray-200 dark:border-white/10 shadow-xl flex items-center justify-between gap-4">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 truncate">
                  <span className="font-black text-gray-900 dark:text-white">{activeLabel}</span> เข้าถึงได้{' '}
                  <span className={`font-black ${mode === 'roles' ? roleConfig.text : mode === 'departments' ? 'text-blue-600 dark:text-blue-400' : 'text-violet-600 dark:text-violet-400'}`}>{accessCount}</span> / {ROUTE_REGISTRY.length} หน้า
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

export default PermissionManagementPage;
