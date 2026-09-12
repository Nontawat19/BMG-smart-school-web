const fs = require("fs");
const path = require("path");
const PROJECT_ID = "epp5online";
const SCHOOL_ID = "0kT1PNH0DV98Qk5A2U1H";
const STUDENT_DOC_ID = "thcaMNlzvLcM2bcKcJjd";
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
const listAll = async (subpath) => {
  let all = []; let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/students/${STUDENT_DOC_ID}/${subpath}`);
    url.searchParams.set('pageSize', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await request(url.toString());
    all.push(...(data.documents||[]));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
};

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const MS_STATUS_SEVERITY = { absent:4, escape:4, leave:3, late:2, present:1 };

const main = async () => {
  const records = await listAll('ClassroomAttendance');
  const bySubject = {};
  records.forEach(d => {
    const r = val({mapValue:{fields:d.fields}});
    if (!bySubject[r.subjectCode]) bySubject[r.subjectCode] = {};
    const dateStr = toDateKey(new Date(r.date));
    const current = bySubject[r.subjectCode][dateStr];
    if (!current || (MS_STATUS_SEVERITY[r.status]??0) >= (MS_STATUS_SEVERITY[current]??0)) {
      bySubject[r.subjectCode][dateStr] = r.status;
    }
  });

  // grade doc updatedAt for each course we care about
  const courseIds = { 'ท21101':'jBu0IhsuMlxrpyGA1GuQ', 'ว21101':'F3bkFwzb0x2DeP6Yrb76' };
  for (const [code, cid] of Object.entries(courseIds)) {
    const gUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/courses/${cid}/grades/${STUDENT_DOC_ID}`;
    const gDoc = await request(gUrl);
    const g = val({mapValue:{fields:gDoc.fields}});
    console.log(`${code}: stored status=${g.status} grade=${g.grade} remark="${g.remark}" updatedAt=${g.updatedAt}`);
  }

  fs.writeFileSync('scratch/data_pimnatcha_daily.json', JSON.stringify(bySubject, null, 2));
  console.log('\nDates recorded per subject (count):', Object.fromEntries(Object.entries(bySubject).map(([k,v])=>[k,Object.keys(v).length])));
};
main().catch(e => { console.error(e.message); process.exit(1); });
