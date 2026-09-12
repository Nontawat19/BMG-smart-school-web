const fs = require("fs");
const path = require("path");
const PROJECT_ID = "epp5online";
const SCHOOL_ID = "0kT1PNH0DV98Qk5A2U1H";

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

const targetCourseIds = {
  'ท21101': 'jBu0IhsuMlxrpyGA1GuQ',
  'ว21101': 'F3bkFwzb0x2DeP6Yrb76',
};

const main = async () => {
  const schedules = await listAll('schedules');
  console.log(`Total schedules: ${schedules.length}`);
  for (const [code, cid] of Object.entries(targetCourseIds)) {
    console.log(`\n=== ${code} (${cid}) ===`);
    let slotCount = 0;
    schedules.forEach(d => {
      const s = val({mapValue:{fields:d.fields}});
      const classId = Array.isArray(s.classId) ? s.classId : [s.classId];
      const schedule = s.schedule || {};
      Object.entries(schedule).forEach(([slotKey, slotVal]) => {
        const arr = Array.isArray(slotVal) ? slotVal : [slotVal];
        arr.forEach(c => {
          if (c && (c.id === cid || (c.code||'').replace(/\s/g,'')===code)) {
            slotCount++;
            console.log(`  scheduleDoc=${d.name.split('/').pop()} classId=${JSON.stringify(classId)} className=${s.className} slot=${slotKey} groupNumber=${c.groupNumber} code=${c.code}`);
          }
        });
      });
    });
    console.log(`  Total matching slots: ${slotCount}`);
  }

  // Also check course_assignments for these
  for (const [code, cid] of Object.entries(targetCourseIds)) {
    const assignUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/school-settings/${SCHOOL_ID}/course_assignments/${cid}_2569_1`;
    try {
      const doc = await request(assignUrl);
      console.log(`\ncourse_assignments for ${code}:`, JSON.stringify(val({mapValue:{fields:doc.fields}}), null, 2));
    } catch(e) { console.log(`\ncourse_assignments for ${code}: NOT FOUND (${e.message})`); }
  }
};
main().catch(e => { console.error(e.message); process.exit(1); });
