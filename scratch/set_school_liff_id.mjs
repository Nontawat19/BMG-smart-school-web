import fs from "node:fs";

const PROJECT_ID = "epp5online";
const DATABASE = "(default)";
const SCHOOL_ID = process.argv[2] || "TSoQLvtWMppnm2mnp3ZS";
const LIFF_ID = process.argv[3] || "2010259164-9UXNRYmU";

const firebaseConfig = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, "utf8")
);
const accessToken = firebaseConfig.tokens?.access_token;
if (!accessToken) throw new Error("Firebase CLI access token not found.");

const docName = `projects/${PROJECT_ID}/databases/${DATABASE}/documents/school-settings/${SCHOOL_ID}`;
const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=lineOASettings.school.liffId`;

const response = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fields: {
      lineOASettings: {
        mapValue: {
          fields: {
            school: {
              mapValue: {
                fields: {
                  liffId: { stringValue: LIFF_ID },
                },
              },
            },
          },
        },
      },
    },
  }),
});

const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  projectId: PROJECT_ID,
  schoolId: SCHOOL_ID,
  liffId: LIFF_ID,
}, null, 2));
