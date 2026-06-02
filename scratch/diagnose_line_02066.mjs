import fs from "node:fs";

const STUDENT_ID = process.argv[2] || "02066";
const PROJECT_IDS = ["epp5online", "bmg-smartschool"];
const DATABASE = "(default)";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const firebaseConfig = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, "utf8")
);
const accessToken = firebaseConfig.tokens?.access_token;
if (!accessToken) throw new Error("Firebase CLI access token not found.");

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${text}`);
  }
  return body;
};

const fieldToJs = (value) => {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fieldToJs);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fieldToJs(item)])
    );
  }
  return undefined;
};

const normalizeHomeroomValue = (value) => String(value ?? "").trim().replace(/\s+/g, "");
const splitHomeroom = (grade, room) => {
  const rawGrade = normalizeHomeroomValue(grade);
  const rawRoom = normalizeHomeroomValue(room);
  const [gradePart, roomPart = ""] = rawGrade.split("/");
  const normalizedGrade = gradePart || rawGrade;
  const normalizedRoom = rawRoom || roomPart;
  return {
    grade: normalizedGrade,
    room: normalizedRoom,
    gradeWithRoom: normalizedGrade && normalizedRoom ? `${normalizedGrade}/${normalizedRoom}` : rawGrade,
  };
};

const isSameHomeroom = (teacher, studentGrade, studentRoom) => {
  const student = splitHomeroom(studentGrade, studentRoom);
  const teacherRoom = splitHomeroom(teacher.homeroomGrade, teacher.homeroomRoom);
  if (!student.grade || !teacherRoom.grade || student.grade !== teacherRoom.grade) return false;
  if (student.room && teacherRoom.room && student.room !== teacherRoom.room) return false;
  if (student.room && !teacherRoom.room && teacherRoom.gradeWithRoom !== student.gradeWithRoom) return false;
  return true;
};

const normalizeName = (fields) => {
  const title = fieldToJs(fields.title) || "";
  const firstName = fieldToJs(fields.firstName) || fieldToJs(fields.firstname) || "";
  const lastName = fieldToJs(fields.lastName) || fieldToJs(fields.lastname) || "";
  const fullName = fieldToJs(fields.name) || fieldToJs(fields.fullName) || "";
  return `${title}${firstName} ${lastName}`.trim() || fullName;
};

const maskLineId = (value) => {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const isLikelyLineUserId = (value) => /^U[0-9a-f]{32}$/i.test(String(value || "").trim());

const getDoc = async (projectId, docName) =>
  requestJson(`https://firestore.googleapis.com/v1/${docName}`).catch((error) => {
    if (String(error.message).includes("404")) return null;
    throw error;
  });

const queryCollection = async (projectId, parent, collectionId, field, value) => {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
      limit: 25,
    },
  };
  const rows = await requestJson(`https://firestore.googleapis.com/v1/${parent}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return rows.map((row) => row.document).filter(Boolean);
};

const listSchools = async (projectId) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/school-settings?pageSize=100`;
  const body = await requestJson(url).catch(() => ({ documents: [] }));
  return body.documents || [];
};

const main = async () => {
  const found = [];
  for (const projectId of PROJECT_IDS) {
    for (const schoolDoc of await listSchools(projectId)) {
      const schoolId = schoolDoc.name.split("/").pop();
      const parent = `projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}`;
      const students = await queryCollection(projectId, parent, "students", "studentId", STUDENT_ID);
      students.forEach((studentDoc) => found.push({ projectId, schoolId, parent, studentDoc, schoolDoc }));
    }
  }

  if (found.length === 0) {
    console.log(JSON.stringify({ found: false, studentId: STUDENT_ID }, null, 2));
    return;
  }

  for (const item of found) {
    const { projectId, schoolId, parent, studentDoc, schoolDoc } = item;
    const student = Object.fromEntries(
      Object.entries(studentDoc.fields || {}).map(([key, value]) => [key, fieldToJs(value)])
    );
    const name = normalizeName(studentDoc.fields || {});
    const attendance = await getDoc(projectId, `${studentDoc.name}/attendance/${TODAY}`);
    const school = fieldToJs({ mapValue: { fields: schoolDoc.fields || {} } }) || {};
    const lineSchool = school.lineOASettings?.school || null;
    const grade = String(student.classLevel || student.grade || student.classroom || "");
    const room = String(student.room || "");
    const homeroom = splitHomeroom(grade, room);
    const gradeCandidates = Array.from(new Set([
      normalizeHomeroomValue(grade),
      homeroom.grade,
      homeroom.gradeWithRoom,
    ].filter(Boolean)));

    const teachersById = new Map();
    for (const gradeCandidate of gradeCandidates) {
      const teachers = await queryCollection(projectId, parent, "teachers", "homeroomGrade", gradeCandidate);
      teachers.forEach((teacherDoc) => {
        const teacher = Object.fromEntries(
          Object.entries(teacherDoc.fields || {}).map(([key, value]) => [key, fieldToJs(value)])
        );
        if (teacher.isHomeroomTeacher && isSameHomeroom(teacher, grade, room)) {
          teachersById.set(teacherDoc.name.split("/").pop(), teacher);
        }
      });
    }

    const homeroomTeachers = [...teachersById.entries()].map(([id, teacher]) => ({
      id,
      name: `${teacher.title || ""}${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.name || "",
      homeroomGrade: teacher.homeroomGrade || "",
      homeroomRoom: teacher.homeroomRoom || "",
      hasLineUserId: Boolean(teacher.lineUserId),
      lineUserIdPreview: maskLineId(teacher.lineUserId),
      lineUserIdLooksValid: isLikelyLineUserId(teacher.lineUserId),
      hasTeacherLineToken: Boolean(teacher.lineChannelAccessToken),
      enableNotification: teacher.enableNotification !== false,
    }));

    const recipientCount =
      (Array.isArray(student.parentLineUserIds) ? student.parentLineUserIds.filter(Boolean).length : 0) +
      homeroomTeachers.filter((teacher) => teacher.hasLineUserId).length;
    const finalConfigSource =
      homeroomTeachers.find((teacher) => teacher.hasTeacherLineToken && teacher.enableNotification)
        ? "homeroomTeacher"
        : lineSchool?.lineChannelAccessToken && lineSchool?.enableNotification !== false
          ? "school"
          : null;

    console.log(JSON.stringify({
      projectId,
      schoolId,
      studentId: STUDENT_ID,
      name,
      grade,
      room,
      attendanceToday: attendance ? {
        status: fieldToJs(attendance.fields?.status),
        scanType: fieldToJs(attendance.fields?.scanType),
        checkinTime: fieldToJs(attendance.fields?.checkinTime),
        checkoutTime: fieldToJs(attendance.fields?.checkoutTime),
        metadata: fieldToJs(attendance.fields?.metadata),
      } : null,
      parentRecipientCount: Array.isArray(student.parentLineUserIds) ? student.parentLineUserIds.filter(Boolean).length : 0,
      homeroomTeachers,
      recipientCount,
      finalConfigSource,
      schoolLineEnabled: Boolean(lineSchool?.lineChannelAccessToken && lineSchool?.enableNotification !== false),
    }, null, 2));
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
