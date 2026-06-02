export const ACTIVE_STUDENT_STATUS = 'กำลังศึกษาอยู่';

export const ACTIVE_STUDENT_STATUS_ALIASES = ['กำลังศึกษา', 'กำลังศึกษาอยู่', 'เรียนอยู่', 'active', 'ปกติ'];

export const ACTIVE_STUDENT_STATUSES = [ACTIVE_STUDENT_STATUS];

export const ARCHIVED_STUDENT_STATUSES = [
  'ย้าย',
  'ลาออก',
  'จำหน่าย',
  'จำหน่ายชื่อออก',
  'สำเร็จการศึกษา',
  'รออนุมัติจบ',
  'ซ้ำชั้น',
  'graduated',
  'exited',
  'pending_grad',
  'repeat',
];

export const EXIT_STUDENT_STATUSES = ['ย้าย', 'ลาออก', 'จำหน่าย', 'จำหน่ายชื่อออก'];

export const normalizeStudentStatus = (status?: string) => {
  const normalized = String(status || '').trim();
  const lower = normalized.toLowerCase();
  return ACTIVE_STUDENT_STATUS_ALIASES.some(s => s.toLowerCase() === lower)
    ? ACTIVE_STUDENT_STATUS
    : normalized;
};

export const getStudentStatus = (student: any) => normalizeStudentStatus(student?.status || student?.studentStatus || ACTIVE_STUDENT_STATUS);

export const isArchivedStudentStatus = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ARCHIVED_STUDENT_STATUSES.some(s => s.toLowerCase() === normalized);
};

export const isExitStudentStatus = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  return EXIT_STUDENT_STATUSES.some(s => s.toLowerCase() === normalized);
};

export const isActiveStudentStatus = (status?: string) => {
  return normalizeStudentStatus(status) === ACTIVE_STUDENT_STATUS && !isArchivedStudentStatus(status);
};

export const isArchivedStudent = (student: any) => isArchivedStudentStatus(getStudentStatus(student));

export const isCurrentStudent = (student: any) => !isArchivedStudent(student);

export const isStudyingStudent = (student: any) => getStudentStatus(student) === ACTIVE_STUDENT_STATUS;

export const buildDuplicateStudentHtml = (student: any) => {
  const status = getStudentStatus(student);
  const isArchived = isArchivedStudentStatus(status);
  return `
    <div class="text-left space-y-3">
      <p>พบข้อมูลนักเรียนที่มีรหัสหรือเลขบัตรประชาชนนี้อยู่แล้วในระบบ:</p>
      <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
        <div class="font-bold text-indigo-600 dark:text-indigo-400 text-lg">
          ${student?.title || ""}${student?.firstName || ""} ${student?.lastName || ""}
        </div>
        <div class="text-sm text-gray-500 mt-1">
          ระดับชั้น: ${student?.classLevel || student?.level || ""}/${student?.room || student?.roomNumber || ""}
        </div>
        <div class="text-xs text-gray-400 mt-1">
          รหัสนักเรียน: ${student?.studentId || "-"} | เลขบัตร: ${student?.idCardNumber || "-"}
        </div>
        <div class="text-xs font-bold mt-2 ${isArchived ? 'text-rose-500' : 'text-amber-500'}">
          สถานะปัจจุบัน: ${status || "-"}
        </div>
      </div>
      <p class="text-xs ${isArchived ? 'text-indigo-500' : 'text-red-500'} font-medium">
        ${isArchived
          ? '* ข้อมูลนี้อยู่ในระบบศิษย์เก่า/นักเรียนจำหน่ายออกแล้ว หากต้องการรับกลับเข้าเรียน ให้ใช้เมนูรับจากศิษย์เก่าเพื่อป้องกันข้อมูลซ้ำ'
          : '* กรุณาตรวจสอบข้อมูลอีกครั้งเพื่อป้องกันการบันทึกซ้ำ'}
      </p>
    </div>
  `;
};
