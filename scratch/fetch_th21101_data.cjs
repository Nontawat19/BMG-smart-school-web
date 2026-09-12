const fs = require("fs");
const path = require("path");
const PROJECT_ID = "epp5online";
const SCHOOL_ID = "0kT1PNH0DV98Qk5A2U1H";
const COURSE_ID = "jBu0IhsuMlxrpyGA1GuQ"; // ท21101
const COURSE_CODE = "ท21101";
const ACADEMIC_YEAR = "2569";

const configPath = path.join(process.env.HOME || "", ".config", "configstore", "firebase-tools.json");
const readAccessToken = () => JSON.parse(fs.readFileSync(configPath, "utf8")).tokens?.access_token;
const request = async (url, options = {}) => {
  const token = readAccessToken();
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!response.ok) { const text = await response.text(); throw new Error(`${response.status}: ${text}`); }
  return response.json();
};
const val = (f) => {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return f.integerValue;
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values||[]).map(val);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields||{}).map(([k,v])=>[k,val(v)]));
  return f;
};

async function runQueryFull(body) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}:runQuery`;
  const data = await request(url, { method: 'POST', body: JSON.stringify(body) });
  return data.filter(x => x.document).map(x => x.document);
}

const main = async () => {
  // enrollments for this course
  const enrollDocs = await runQueryFull({
    structuredQuery: {
      from: [{ collectionId: 'enrollments' }],
      where: { fieldFilter: { field: { fieldPath: 'courseId' }, op: 'EQUAL', value: { stringValue: COURSE_ID } } },
      limit: 1000
    }
  });
  const enrollments = enrollDocs.map(d => val({mapValue:{fields:d.fields}}));
  fs.writeFileSync('scratch/data_th21101_enrollments.json', JSON.stringify(enrollments, null, 2));
  console.log(`Enrollments: ${enrollments.length}`);
  const byRoom = {};
  enrollments.forEach(e => { const r = String(e.room||''); byRoom[r]=(byRoom[r]||0)+1; });
  console.log('By room:', byRoom);

  // all attendance for this subjectCode
  let allAttendance = [];
  let offset = 0;
  const PAGE = 300;
  while (true) {
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'ClassroomAttendance', allDescendants: true }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'schoolId' }, op: 'EQUAL', value: { stringValue: SCHOOL_ID } } },
              { fieldFilter: { field: { fieldPath: 'subjectCode' }, op: 'EQUAL', value: { stringValue: COURSE_CODE } } },
              { fieldFilter: { field: { fieldPath: 'academicYear' }, op: 'EQUAL', value: { stringValue: ACADEMIC_YEAR } } },
            ]
          }
        },
        orderBy: [{ field: { fieldPath: '__name__' } }],
        limit: PAGE,
        offset,
      }
    };
    const data = await request(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, { method: 'POST', body: JSON.stringify(body) });
    const docs = data.filter(x => x.document).map(x => x.document);
    allAttendance.push(...docs);
    if (docs.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Total attendance records for ${COURSE_CODE}: ${allAttendance.length}`);
  const records = allAttendance.map(d => val({mapValue:{fields:d.fields}}));
  fs.writeFileSync('scratch/data_th21101_attendance.json', JSON.stringify(records, null, 2));

  // calendar already have data_calendar.json (same school/year), reuse
};
main().catch(e => { console.error(e.message); process.exit(1); });
