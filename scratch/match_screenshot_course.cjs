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

const courseIds = {
  'ว21101': 'F3bkFwzb0x2DeP6Yrb76',
  'พ21102': 'H7uqOPPGWgn1aQDIoh8C',
  'ว21202': 'Vpg58DPAqziJOi6J10ZF',
  'ส21101': 'X0NuPV0qItgcBBcOfAGS',
  'กิจกรรม5+1A': 'aci3uUsUGNufXBHvidIY',
  'ค21201': 'csb2xjoxNOj2hNwu4M6a',
  'อ21101': 'dZSEZIkSaHHRFqV0L5tq',
  'ศ21101': 'hnkBuBjXoSM3ybzX21N4',
  'ท21101': 'jBu0IhsuMlxrpyGA1GuQ',
  'ส21102': 'sumMpyK7R5o4ij8jRKH6',
  'ว21201': 'vctzWjygmHhRlKXunxpj',
  'กิจกรรม5+1B': 'w65Jp6WjuCZLCyKiA7VA',
};

const main = async () => {
  for (const [code, cid] of Object.entries(courseIds)) {
    const grades = await listAll(`courses/${cid}/grades`);
    let msCount = 0, total = 0;
    grades.forEach(d => {
      const g = val({mapValue:{fields:d.fields}});
      total++;
      if (g.status === 'มส') msCount++;
    });
    console.log(`${code}: total grade docs=${total}, มส count=${msCount}`);
  }
};
main().catch(e => { console.error(e.message); process.exit(1); });
