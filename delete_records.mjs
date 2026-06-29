// ลบข้อมูลสอนแทน นายธนวัฒน์ จุลศรี วันที่ 29 มิ.ย. 2569 คาบ 1-4
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs'), path = require('path'), os = require('os');

const PROJECT_ID = 'epp5online';
const SCHOOL_ID = 'BIpkfipsA9pmKvwUH85c';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).tokens?.access_token;
}

async function firestoreGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function firestoreDelete(url, token) {
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const token = getAccessToken();
  if (!token) { console.error('❌ ไม่พบ access token'); process.exit(1); }

  // ดึง substitutions ทั้งหมดของ school
  let docs = [], pageToken = null;
  do {
    const url = `${BASE_URL}/school-settings/${SCHOOL_ID}/substitutions?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await firestoreGet(url, token);
    if (res.documents) docs.push(...res.documents);
    pageToken = res.nextPageToken || null;
  } while (pageToken);

  console.log(`📄 พบ substitutions ทั้งหมด: ${docs.length} รายการ`);

  // กรองหาของ นายธนวัฒน์ จุลศรี วันที่ 2026-06-28 (UTC = 29 มิ.ย. ไทย) คาบ 1-4
  const targets = docs.filter(d => {
    const fields = d.fields || {};
    const teacherName = fields.originalTeacherName?.stringValue || '';
    const dateTs = fields.date?.timestampValue || '';
    const period = parseInt(fields.period?.integerValue || fields.period?.stringValue || '0');
    const dateKey = dateTs.substring(0, 10); // "2026-06-28"
    return teacherName === 'นายธนวัฒน์ จุลศรี' && dateKey === '2026-06-28' && period >= 1 && period <= 4;
  });

  if (targets.length === 0) {
    console.log('✅ ไม่พบข้อมูลที่ต้องลบ');
    process.exit(0);
  }

  console.log(`\n🗑️  พบรายการที่ต้องลบ ${targets.length} รายการ:`);
  for (const d of targets) {
    const fields = d.fields || {};
    const docId = d.name.split('/').pop();
    const period = fields.period?.integerValue || fields.period?.stringValue || '?';
    const subName = fields.substituteTeacherName?.stringValue || '?';
    console.log(`   คาบ ${period} → ${subName} [${docId}]`);
    await firestoreDelete(`${BASE_URL}/school-settings/${SCHOOL_ID}/substitutions/${docId}`, token);
    console.log(`   ✅ ลบแล้ว`);
  }

  console.log(`\n✅ ลบทั้งหมด ${targets.length} รายการเรียบร้อย`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
