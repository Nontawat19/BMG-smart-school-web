const fs = require("fs");
const path = require("path");
const PROJECT_ID = "epp5online";
const SCHOOL_ID = "0kT1PNH0DV98Qk5A2U1H";
const STUDENT_DOC_ID = "thcaMNlzvLcM2bcKcJjd";

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
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/${subpath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await request(url.toString());
    all.push(...(data.documents||[]));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
};

const main = async () => {
  const courses = await listAll('courses');
  console.log(`Total courses: ${courses.length}`);
  for (const c of courses) {
    const cid = c.name.split('/').pop();
    const cf = val({mapValue:{fields:c.fields}});
    const classId = Array.isArray(cf.classId) ? cf.classId : [cf.classId];
    if (!classId.some(x => String(x).includes('m1'))) continue;
    // check grade doc
    const gradeUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/courses/${cid}/grades/${STUDENT_DOC_ID}`;
    try {
      const gDoc = await request(gradeUrl);
      const g = val({mapValue:{fields:gDoc.fields}});
      if (g.status) {
        console.log(`course ${cf.code} (${cf.title}) id=${cid} classId=${JSON.stringify(cf.classId)} subjectGroup=${cf.subjectGroup} hoursPerWeek=${cf.hoursPerWeek} credits=${cf.credits} -> grade status=${g.status} grade=${g.grade} remark=${g.remark}`);
      }
    } catch(e) { /* no grade doc, skip */ }
  }
};
main().catch(e => { console.error(e.message); process.exit(1); });
