import fs from "node:fs";

const PROJECT_IDS = ["epp5online", "bmg-smartschool"];
const DATABASE = "(default)";
const TARGET_SCHOOL_NAME = process.argv[2] || "ไชยบุรีวิทยาคม";

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

const docToJs = (doc) => ({
  id: doc.name.split("/").pop(),
  ...Object.fromEntries(
    Object.entries(doc.fields || {}).map(([key, value]) => [key, fieldToJs(value)])
  ),
});

const listDocuments = async (projectId, path) => {
  const docs = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({ pageSize: "200" });
    if (pageToken) query.set("pageToken", pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/${path}?${query.toString()}`;
    const body = await requestJson(url);
    docs.push(...(body.documents || []).map(docToJs));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return docs;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const main = async () => {
  for (const projectId of PROJECT_IDS) {
    const schools = await listDocuments(projectId, "school-settings");
    const school = schools.find((item) => normalize(item.name) === normalize(TARGET_SCHOOL_NAME));
    if (!school) continue;

    console.log(`PROJECT=${projectId}`);
    console.log(`SCHOOL_ID=${school.id}`);
    console.log(`SCHOOL_NAME=${school.name}`);

    const teachers = await listDocuments(projectId, `school-settings/${school.id}/teachers`);
    const lockedTeachers = teachers
      .map((teacher) => ({
        id: teacher.id,
        name: teacher.name || `${teacher.title || ""}${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
        unavailableSlots: teacher.preferences?.unavailableSlots || [],
      }))
      .filter((teacher) => Array.isArray(teacher.unavailableSlots) && teacher.unavailableSlots.length > 0)
      .sort((a, b) => b.unavailableSlots.length - a.unavailableSlots.length);

    console.log(`LOCKED_TEACHERS=${lockedTeachers.length}`);
    lockedTeachers.forEach((teacher) => {
      console.log(`- ${teacher.name || teacher.id} [${teacher.id}]`);
      console.log(`  slots: ${teacher.unavailableSlots.join(", ")}`);
    });

    return;
  }

  console.log(`School not found: ${TARGET_SCHOOL_NAME}`);
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
