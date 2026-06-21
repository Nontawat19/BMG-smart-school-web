export interface LearnerActivityTeacherScope {
  key: string;
  teacherId: string;
  teacherIds: string[];
  teacherName?: string;
  classLevels: string[];
  roomIds: string[];
  groupNumber?: number;
  roomLabel?: string;
}

interface CourseTeacherAssignmentLike {
  teacherId?: string;
  teacherIds?: string[];
  classLevels?: string[];
  roomIds?: string[];
  groupNumber?: number;
  room?: string;
}

interface CourseLike {
  id?: string;
  classId?: string | string[];
  teacherAssignments?: CourseTeacherAssignmentLike[];
}

interface ActivityLike {
  responsibleTeacherIds?: string[];
  teacherScopes?: LearnerActivityTeacherScope[];
  classId?: string | string[];
}

const normalizeStringArray = (value?: string | string[] | null): string[] => {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

export const getAssignmentTeacherIds = (assignment?: { teacherId?: string; teacherIds?: string[] } | null): string[] => {
  const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
    ? assignment.teacherIds
    : (assignment?.teacherId ? [assignment.teacherId] : []);
  return Array.from(new Set(ids.filter((id) => id && id !== "pending" && !String(id).startsWith("GHOST"))));
};

export const buildTeacherScopeKey = (scope: {
  teacherId?: string;
  teacherIds?: string[];
  classLevels?: string[];
  roomIds?: string[];
  groupNumber?: number;
}): string => {
  const teacherIds = Array.from(new Set(normalizeStringArray(scope.teacherIds).concat(scope.teacherId ? [scope.teacherId] : []))).sort();
  const classLevels = normalizeStringArray(scope.classLevels).sort();
  const roomIds = normalizeStringArray(scope.roomIds).sort();
  const groupPart = Number.isFinite(Number(scope.groupNumber)) && Number(scope.groupNumber) > 0
    ? `g${Number(scope.groupNumber)}`
    : "g0";

  return [
    teacherIds.length > 0 ? `t:${teacherIds.join("|")}` : "t:none",
    classLevels.length > 0 ? `c:${classLevels.join("|")}` : "c:any",
    roomIds.length > 0 ? `r:${roomIds.join("|")}` : "r:any",
    groupPart,
  ].join("__");
};

export const deriveTeacherScopesFromCourse = (
  activity: ActivityLike,
  course?: CourseLike | null,
  teacherMap?: Record<string, any>,
): LearnerActivityTeacherScope[] => {
  if (Array.isArray(activity.teacherScopes) && activity.teacherScopes.length > 0) {
    return dedupeTeacherScopes(activity.teacherScopes, teacherMap);
  }

  const courseAssignments = Array.isArray(course?.teacherAssignments) ? course.teacherAssignments : [];
  const fallbackClassLevels = normalizeStringArray(activity.classId || course?.classId);

  if (courseAssignments.length > 0) {
    return dedupeTeacherScopes(courseAssignments.flatMap((assignment) => {
      const teacherIds = getAssignmentTeacherIds(assignment);
      if (teacherIds.length === 0) return [];
      const classLevels = normalizeStringArray(assignment.classLevels).length > 0
        ? normalizeStringArray(assignment.classLevels)
        : fallbackClassLevels;
      const roomIds = normalizeStringArray(assignment.roomIds || assignment.room);
      const primaryTeacherId = teacherIds[0];

      return [{
        key: buildTeacherScopeKey({
          teacherId: primaryTeacherId,
          teacherIds,
          classLevels,
          roomIds,
          groupNumber: assignment.groupNumber,
        }),
        teacherId: primaryTeacherId,
        teacherIds,
        teacherName: teacherMap?.[primaryTeacherId]?.name || "",
        classLevels,
        roomIds,
        groupNumber: assignment.groupNumber,
      }];
    }), teacherMap);
  }

  const fallbackTeacherIds = Array.from(new Set(normalizeStringArray(activity.responsibleTeacherIds)));
  return dedupeTeacherScopes(fallbackTeacherIds.map((teacherId) => ({
    key: buildTeacherScopeKey({ teacherId, teacherIds: [teacherId], classLevels: fallbackClassLevels }),
    teacherId,
    teacherIds: [teacherId],
    teacherName: teacherMap?.[teacherId]?.name || "",
    classLevels: fallbackClassLevels,
    roomIds: [],
  })), teacherMap);
};

export const dedupeTeacherScopes = (
  scopes: LearnerActivityTeacherScope[],
  teacherMap?: Record<string, any>,
): LearnerActivityTeacherScope[] => {
  const scopeMap = new Map<string, LearnerActivityTeacherScope>();

  scopes.forEach((scope) => {
    const teacherIds = Array.from(new Set(normalizeStringArray(scope.teacherIds).concat(scope.teacherId ? [scope.teacherId] : [])));
    if (teacherIds.length === 0) return;

    const normalized: LearnerActivityTeacherScope = {
      key: String(scope.key || buildTeacherScopeKey(scope)),
      teacherId: scope.teacherId || teacherIds[0],
      teacherIds,
      teacherName: scope.teacherName || teacherMap?.[scope.teacherId || teacherIds[0]]?.name || "",
      classLevels: normalizeStringArray(scope.classLevels),
      roomIds: normalizeStringArray(scope.roomIds),
      groupNumber: scope.groupNumber,
      roomLabel: scope.roomLabel,
    };

    const existing = scopeMap.get(normalized.key);
    if (!existing) {
      scopeMap.set(normalized.key, normalized);
      return;
    }

    scopeMap.set(normalized.key, {
      ...existing,
      teacherIds: Array.from(new Set([...existing.teacherIds, ...normalized.teacherIds])),
      classLevels: Array.from(new Set([...existing.classLevels, ...normalized.classLevels])),
      roomIds: Array.from(new Set([...existing.roomIds, ...normalized.roomIds])),
      teacherName: existing.teacherName || normalized.teacherName,
      groupNumber: existing.groupNumber ?? normalized.groupNumber,
      roomLabel: existing.roomLabel || normalized.roomLabel,
    });
  });

  return Array.from(scopeMap.values());
};

export const scopeIncludesTeacher = (scope: LearnerActivityTeacherScope | null | undefined, teacherId?: string | null) => {
  if (!scope || !teacherId) return false;
  return scope.teacherIds.includes(String(teacherId)) || scope.teacherId === String(teacherId);
};

const CLASS_LEVEL_NAMES: Record<string, string> = {
  k1: "อ.1", k2: "อ.2", k3: "อ.3",
  p1: "ป.1", p2: "ป.2", p3: "ป.3", p4: "ป.4", p5: "ป.5", p6: "ป.6",
  m1: "ม.1", m2: "ม.2", m3: "ม.3", m4: "ม.4", m5: "ม.5", m6: "ม.6",
};

const formatClassLevel = (key: string) => CLASS_LEVEL_NAMES[key.toLowerCase()] || key;

export const formatTeacherScopeLabel = (scope: LearnerActivityTeacherScope, teacherMap?: Record<string, any>) => {
  const teacherNames = scope.teacherIds
    .map((id) => teacherMap?.[id]?.name || scope.teacherName || id)
    .filter(Boolean)
    .join(", ");
  const classText = scope.classLevels.length > 0
    ? scope.classLevels.map(formatClassLevel).join(", ")
    : "ทุกชั้น";
  const roomText = scope.roomIds.length > 0 ? `ห้อง ${scope.roomIds.join(", ")}` : "";
  const groupText = scope.groupNumber ? `กลุ่ม ${scope.groupNumber}` : "";
  return [teacherNames || "ไม่ระบุครู", classText, roomText, groupText].filter(Boolean).join(" • ");
};

export const buildLearnerActivityMemberDocId = (
  academicYear: string,
  semester: string,
  teacherScopeKey: string,
  studentId: string,
) => {
  return `${academicYear}_${semester}_${sanitizeLearnerActivityKey(teacherScopeKey)}_${sanitizeLearnerActivityKey(studentId)}`;
};

export const buildLearnerActivityAttendanceDocId = (
  academicYear: string,
  semester: string,
  dateStr: string,
  specialPeriodId?: string,
  teacherScopeKey?: string,
) => {
  const baseId = `${academicYear}_S${semester}_${dateStr}`;
  const periodPart = specialPeriodId ? `_${sanitizeLearnerActivityKey(specialPeriodId)}` : "";
  const scopePart = teacherScopeKey ? `_${sanitizeLearnerActivityKey(teacherScopeKey)}` : "";
  return `${baseId}${periodPart}${scopePart}`;
};

export const buildLearnerActivityEvaluationDocId = (
  academicYear: string,
  semester: string,
  teacherScopeKey?: string,
) => {
  return teacherScopeKey
    ? `${academicYear}_${semester}_${sanitizeLearnerActivityKey(teacherScopeKey)}`
    : `${academicYear}_${semester}`;
};

export const sanitizeLearnerActivityKey = (value: string) => {
  return String(value || "").replace(/[\/#?[\]]/g, "_");
};
