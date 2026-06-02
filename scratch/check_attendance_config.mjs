import fs from "node:fs";

const PROJECT_ID = "epp5online";
const DATABASE = "(default)";
const SCHOOL_ID = process.argv[2] || "TSoQLvtWMppnm2mnp3ZS";

const firebaseConfig = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, "utf8")
);
const accessToken = firebaseConfig.tokens?.access_token;
if (!accessToken) throw new Error("Firebase CLI access token not found.");

const requestJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const fieldToJs = (value) => {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fieldToJs);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fieldToJs(item)])
    );
  }
  return undefined;
};

const main = async () => {
  const docName = `projects/${PROJECT_ID}/databases/${DATABASE}/documents/school-settings/${SCHOOL_ID}`;
  const body = await requestJson(`https://firestore.googleapis.com/v1/${docName}`);
  const school = fieldToJs({ mapValue: { fields: body.fields || {} } }) || {};
  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    schoolId: SCHOOL_ID,
    attendanceConfig: school.attendanceConfig || null,
    lineOASettings: school.lineOASettings || null,
  }, null, 2));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
