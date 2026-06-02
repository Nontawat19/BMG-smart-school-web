const fs = require("fs");
const path = require("path");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "bmg-smartschool";
const SCHOOL_ID = process.env.SCHOOL_ID || "47InBfx2m1le9jpI6kaG";
const ACTIVE_STATUS = "กำลังศึกษาอยู่";
const ACTIVE_ALIASES = new Set(["กำลังศึกษา", "กำลังศึกษาอยู่", "เรียนอยู่", "active", "ปกติ"]);
const ARCHIVED_STATUSES = new Set([
  "ย้าย",
  "ลาออก",
  "จำหน่าย",
  "จำหน่ายชื่อออก",
  "สำเร็จการศึกษา",
  "รออนุมัติจบ",
  "ซ้ำชั้น",
  "graduated",
  "exited",
  "pending_grad",
  "repeat",
]);

const configPath = path.join(process.env.HOME || "", ".config", "configstore", "firebase-tools.json");

const readAccessToken = () => {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = config.tokens?.access_token;
  const expiresAt = Number(config.tokens?.expires_at || 0);
  if (!token) throw new Error("Firebase CLI access token not found. Run firebase login first.");
  if (expiresAt && expiresAt < Date.now() + 60_000) {
    throw new Error("Firebase CLI access token is expired. Run a firebase command to refresh it, then retry.");
  }
  return token;
};

const fieldString = (doc, key) => doc.fields?.[key]?.stringValue || "";

const shouldNormalizeStudent = (doc) => {
  const status = fieldString(doc, "status").trim();
  const studentStatus = fieldString(doc, "studentStatus").trim();
  const primaryStatus = status || studentStatus || ACTIVE_STATUS;
  const lowerPrimaryStatus = primaryStatus.toLowerCase();

  if (ARCHIVED_STATUSES.has(primaryStatus) || ARCHIVED_STATUSES.has(lowerPrimaryStatus)) return false;
  return ACTIVE_ALIASES.has(primaryStatus) && (status !== ACTIVE_STATUS || studentStatus !== ACTIVE_STATUS);
};

const request = async (url, options = {}) => {
  const token = readAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
};

const listStudents = async () => {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/students`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await request(url.toString());
    documents.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return documents;
};

const patchStudentStatus = async (doc) => {
  const url = new URL(`https://firestore.googleapis.com/v1/${doc.name}`);
  url.searchParams.append("updateMask.fieldPaths", "status");
  url.searchParams.append("updateMask.fieldPaths", "studentStatus");

  await request(url.toString(), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        status: { stringValue: ACTIVE_STATUS },
        studentStatus: { stringValue: ACTIVE_STATUS },
      },
    }),
  });
};

const main = async () => {
  console.log(`Migrating student statuses in ${PROJECT_ID}/school-settings/${SCHOOL_ID}/students`);
  const students = await listStudents();
  const targets = students.filter(shouldNormalizeStudent);

  console.log(`Found ${students.length} student docs, ${targets.length} need status normalization.`);

  for (let i = 0; i < targets.length; i += 1) {
    await patchStudentStatus(targets[i]);
    if ((i + 1) % 25 === 0 || i + 1 === targets.length) {
      console.log(`Updated ${i + 1}/${targets.length}`);
    }
  }

  console.log("Done.");
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
