import fs from "node:fs";

const STUDENT_ID = "02066";
const TARGET_NAME_PARTS = ["วัชรพงศ์", "เขียวค้า"];
const PROJECT_IDS = ["epp5online", "bmg-smartschool"];
const DATABASE = "(default)";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const firebaseConfigPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
const accessToken = firebaseConfig.tokens?.access_token;

if (!accessToken) {
  throw new Error("Firebase CLI access token not found. Please run firebase login first.");
}

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

const docUrl = (projectId, docName) =>
  `https://firestore.googleapis.com/v1/${docName}`;

const commitUrl = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents:commit`;

const runQueryUrl = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents:runQuery`;

const getNested = (fields, path) => {
  let current = fields;
  for (const key of path.split(".")) {
    const value = current?.[key];
    if (!value) return undefined;
    if (value.mapValue) current = value.mapValue.fields || {};
    else return value;
  }
  return current;
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

const jsToField = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
};

const quoteFieldPathSegment = (segment) => {
  const value = String(segment);
  return /^[A-Za-z_][A-Za-z_0-9]*$/.test(value)
    ? value
    : `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
};

const getStatusKey = (status) => {
  if (!status) return null;
  const s = String(status).trim().toLowerCase();
  if (["มา", "ontime", "present", "earlyreturn", "กลับก่อน", "early"].includes(s)) return "present";
  if (["สาย", "late"].includes(s)) return "late";
  if (["ลา", "leave"].includes(s) || s.includes("ลา")) return "leave";
  if (["ขาด", "absent"].includes(s)) return "absent";
  if (["ไปราชการ", "officialtravel"].includes(s)) return "officialTravel";
  if (["ไม่ลงเวลาออก", "nocheckout"].includes(s)) return "noCheckout";
  return null;
};

const getBehaviorPenalty = (status, config) => {
  const normalized = String(status || "").trim().toLowerCase();
  const key =
    ["สาย", "late"].includes(normalized) ? "late" :
    ["ขาด", "absent"].includes(normalized) ? "absent" :
    ["กลับก่อน", "early", "earlyreturn"].includes(normalized) ? "early" :
    ["ไม่ลงเวลาออก", "nocheckout", "no_checkout"].includes(normalized) ? "noCheckout" :
    null;

  if (!key) return 0;
  const defaultRules = [
    { statusKey: "late", points: 5, isActive: true },
    { statusKey: "absent", points: 10, isActive: true },
    { statusKey: "early", points: 5, isActive: true },
    { statusKey: "noCheckout", points: 3, isActive: true },
  ];
  const rules = Array.isArray(config?.attendanceRules) && config.attendanceRules.length
    ? config.attendanceRules
    : defaultRules;
  const rule = rules.find((item) => item.statusKey === key);
  if (!rule || rule.isActive === false) return 0;
  return Math.max(0, Number(rule.points) || 0);
};

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

const getPeriodKeys = (dateStr, academicYearOverride) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const beYear = date.getFullYear() + 543;
  const term = month >= 5 && month <= 10 ? "1" : "2";
  const academicYear = month <= 4 ? beYear - 1 : beYear;
  const yearKey = academicYearOverride || String(academicYear);
  return {
    weekKey: getWeekNumber(date),
    monthKey: dateStr.substring(0, 7),
    yearKey,
    semesterKey: `${yearKey}-${term}`,
  };
};

const findStudents = async (projectId) => {
  const schoolsUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/school-settings?pageSize=100`;
  const schools = await requestJson(schoolsUrl).catch((error) => {
    if (String(error.message).includes("404")) return { documents: [] };
    throw error;
  });

  const matches = [];
  for (const schoolDoc of schools.documents || []) {
    const schoolId = schoolDoc.name.split("/").pop();
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: "students" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "studentId" },
            op: "EQUAL",
            value: { stringValue: STUDENT_ID },
          },
        },
        limit: 10,
      },
    };

    const parent =
      `projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}`;
    const results = await requestJson(`https://firestore.googleapis.com/v1/${parent}:runQuery`, {
      method: "POST",
      body: JSON.stringify(queryBody),
    });

    results
      .map((item) => item.document)
      .filter(Boolean)
      .forEach((doc) => matches.push({ projectId, doc }));
  }

  return matches;
};

const normalizeName = (studentFields) => {
  const title = fieldToJs(studentFields.title) || "";
  const firstName = fieldToJs(studentFields.firstName) || fieldToJs(studentFields.firstname) || "";
  const lastName = fieldToJs(studentFields.lastName) || fieldToJs(studentFields.lastname) || "";
  const fullName = fieldToJs(studentFields.name) || fieldToJs(studentFields.fullName) || "";
  return `${title}${firstName} ${lastName}`.trim() || fullName;
};

const getSchoolIdFromStudentDocName = (docName) => {
  const parts = docName.split("/documents/school-settings/")[1]?.split("/");
  return parts?.[0] || null;
};

const main = async () => {
  const candidates = (await Promise.all(PROJECT_IDS.map(findStudents))).flat();
  const namedMatches = candidates.filter(({ doc }) => {
    const name = normalizeName(doc.fields || "");
    return TARGET_NAME_PARTS.every((part) => name.includes(part));
  });
  const matches = namedMatches.length ? namedMatches : candidates;

  if (matches.length !== 1) {
    console.log("Found candidates:", candidates.map(({ projectId, doc }) => ({
      projectId,
      path: doc.name,
      name: normalizeName(doc.fields || {}),
    })));
    throw new Error(`Expected exactly one matching student for ${STUDENT_ID}, found ${matches.length}. Aborting.`);
  }

  const { projectId, doc: studentDoc } = matches[0];
  const studentName = normalizeName(studentDoc.fields || {});
  const schoolId = getSchoolIdFromStudentDocName(studentDoc.name);
  if (!schoolId) throw new Error("Could not parse schoolId from student path.");

  const attendanceDocName = `${studentDoc.name}/attendance/${TODAY}`;
  const attendance = await requestJson(docUrl(projectId, attendanceDocName)).catch((error) => {
    if (String(error.message).includes("404")) return null;
    throw error;
  });

  if (!attendance) {
    console.log(`No attendance record found for ${studentName} (${STUDENT_ID}) on ${TODAY}. Nothing to delete.`);
    return;
  }

  const status = fieldToJs(attendance.fields?.status) || null;
  const statusKey = getStatusKey(status);
  const classLevel = fieldToJs(attendance.fields?.classLevel) || fieldToJs(studentDoc.fields?.classLevel) || "";

  const schoolDoc = await requestJson(docUrl(projectId, `projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}`)).catch(() => null);
  const calendarDoc = await requestJson(docUrl(projectId, `projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}/main_calendar/default`)).catch(() => null);
  const behaviorConfig = fieldToJs(schoolDoc?.fields?.behaviorScoreConfig) || null;
  const academicYear = fieldToJs(calendarDoc?.fields?.academicYear) || "";
  const penaltyToRestore = getBehaviorPenalty(status, behaviorConfig);
  const currentScore = Number(fieldToJs(studentDoc.fields?.behaviorScore) ?? 100);
  const maxScore = Number(behaviorConfig?.maxScore ?? 100);
  const restoredScore = Math.min(maxScore, currentScore + penaltyToRestore);
  const { weekKey, monthKey, yearKey, semesterKey } = getPeriodKeys(TODAY, academicYear);

  const writes = [{ delete: attendanceDocName }];

  if (statusKey) {
    const decrement = { integerValue: "-1" };
    const summaryDocs = [
      `${studentDoc.name}/Weeksummary/${weekKey}`,
      `${studentDoc.name}/Monthsummary/${monthKey}`,
      `${studentDoc.name}/Yearsummary/${yearKey}`,
      `${studentDoc.name}/Semestersummary/${semesterKey}`,
    ];

    summaryDocs.forEach((document) => {
      writes.push({
        transform: {
          document,
          fieldTransforms: [{ fieldPath: statusKey, increment: decrement }],
        },
      });
    });

    const fieldTransforms = [{ fieldPath: statusKey, increment: decrement }];
    if (classLevel) {
      fieldTransforms.push({
        fieldPath: `classes.${quoteFieldPathSegment(classLevel)}.${statusKey}`,
        increment: decrement,
      });
    }
    writes.push({
      transform: {
        document: `projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}/Todaysummary/students_${TODAY}`,
        fieldTransforms,
      },
    });
  }

  if (penaltyToRestore > 0 && Number.isFinite(currentScore)) {
    writes.push({
      update: {
        name: studentDoc.name,
        fields: {
          behaviorScore: jsToField(restoredScore),
          lastAttendanceReset: jsToField(`reset ${TODAY} ${status || ""}`),
        },
      },
      updateMask: { fieldPaths: ["behaviorScore", "lastAttendanceReset"] },
    });
  }

  await requestJson(commitUrl(projectId), {
    method: "POST",
    body: JSON.stringify({ writes }),
  });

  console.log(JSON.stringify({
    ok: true,
    projectId,
    schoolId,
    studentId: STUDENT_ID,
    studentName,
    date: TODAY,
    deletedAttendance: true,
    previousStatus: status,
    adjustedSummaryKey: statusKey,
    restoredBehaviorScore: penaltyToRestore > 0 ? { from: currentScore, to: restoredScore } : null,
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
