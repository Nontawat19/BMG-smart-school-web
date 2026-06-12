import fs from "node:fs";

const PROJECT_IDS = ["epp5online", "bmg-smartschool"];
const DATABASE = "(default)";

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

const listSchools = async (projectId) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/school-settings?pageSize=100`;
  const body = await requestJson(url).catch((err) => {
    console.error(`Error listing schools for ${projectId}:`, err);
    return { documents: [] };
  });
  return body.documents || [];
};

const listSpecialPeriods = async (projectId, schoolId) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}/special-periods?pageSize=100`;
  const body = await requestJson(url).catch(() => ({ documents: [] }));
  return (body.documents || []).map(doc => ({
    id: doc.name.split("/").pop(),
    ...Object.fromEntries(
      Object.entries(doc.fields || {}).map(([key, value]) => [key, fieldToJs(value)])
    )
  }));
};

const listLearnerActivities = async (projectId, schoolId) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/documents/school-settings/${schoolId}/learner-activities?pageSize=100`;
  const body = await requestJson(url).catch(() => ({ documents: [] }));
  return (body.documents || []).map(doc => ({
    id: doc.name.split("/").pop(),
    ...Object.fromEntries(
      Object.entries(doc.fields || {}).map(([key, value]) => [key, fieldToJs(value)])
    )
  }));
};

const main = async () => {
  for (const projectId of PROJECT_IDS) {
    console.log(`=== Project: ${projectId} ===`);
    const schools = await listSchools(projectId);
    for (const schoolDoc of schools) {
      const schoolId = schoolDoc.name.split("/").pop();
      const schoolName = fieldToJs(schoolDoc.fields?.name) || schoolId;
      console.log(`  School: ${schoolName} (${schoolId})`);
      
      const periods = await listSpecialPeriods(projectId, schoolId);
      console.log("    Special Periods:");
      periods.forEach(p => {
        console.log(`      - ID: ${p.id}, Title: "${p.title}", Day: "${p.day}", Time: ${p.startTime}-${p.endTime}, isTeachingLoad: ${p.isTeachingLoad}`);
      });
      
      const activities = await listLearnerActivities(projectId, schoolId);
      console.log("    Learner Activities:");
      activities.forEach(a => {
        console.log(`      - ID: ${a.id}, Name: "${a.name}", specialPeriodId: "${a.specialPeriodId}", specialPeriodTitle: "${a.specialPeriodTitle}"`);
      });
    }
  }
};

main().catch(console.error);
