const fs = require('fs');

const attendanceRecords = JSON.parse(fs.readFileSync('scratch/data_th21101_attendance.json', 'utf8'));
const enrollments = JSON.parse(fs.readFileSync('scratch/data_th21101_enrollments.json', 'utf8'));
const calendarData = JSON.parse(fs.readFileSync('scratch/data_calendar.json', 'utf8'));

const DAY_KEY_MAP = ['sun','mon','tue','wed','thu','fri','sat'];
const SESSIONS_PER_PAGE = 28;
const MS_STATUS_SEVERITY = { absent:4, escape:4, leave:3, late:2, present:1 };
const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const checkIsHolidayLocal = (dateStr, events) => {
  if (!dateStr || !events) return { isHoliday:false, description:'' };
  const event = events[dateStr];
  const d = new Date(dateStr);
  const dayOfWeek = d.getUTCDay();
  if (event) {
    if (event.type === 'holiday') return { isHoliday:true, description: event.description||'วันหยุดราชการ' };
    if (event.type === 'specialHoliday') return { isHoliday:true, description: event.description||'วันหยุดกรณีพิเศษ' };
    if (event.type === 'schoolDay') return { isHoliday:false, description: event.description||'วันเรียนชดเชย' };
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) return { isHoliday:true, description:'วันหยุดเสาร์-อาทิตย์' };
  return { isHoliday:false, description:'' };
};
const isStudentEnrolledOnDay = (student, dateStr) => {
  if (!student.enrolledAt || typeof student.enrolledAt !== 'string') return true;
  return dateStr >= student.enrolledAt.slice(0,10);
};

function buildAttendancePages(calendarData, courseSchedule, selectedSemester, selectedClass, studentCourseDailyStatus, checkIsHoliday = checkIsHolidayLocal) {
  if (!calendarData?.terms || !selectedClass) return [];
  const allPages = [];
  let annualHourCounter = 0;
  const termsToProcess = selectedSemester === '2' ? ['term2'] : selectedSemester === '1' ? ['term1'] : ['term1','term2'];
  for (const termKey of termsToProcess) {
    const termData = calendarData.terms[termKey];
    if (!termData?.startDate || !termData?.endDate) continue;
    let termSessionBuffer = [];
    let termHourCounter = 0;
    const events = calendarData.events || {};
    const termStartDate = new Date(termData.startDate);
    const termEndDate = new Date(termData.endDate);
    let currentDay = new Date(termStartDate);
    const startDayOffset = currentDay.getDay();
    if (startDayOffset > 0) currentDay.setUTCDate(currentDay.getUTCDate() - startDayOffset);
    while (currentDay <= termEndDate) {
      const y = currentDay.getFullYear();
      const m = String(currentDay.getMonth()+1).padStart(2,'0');
      const d = String(currentDay.getDate()).padStart(2,'0');
      const dateStr = `${y}-${m}-${d}`;
      const { isHoliday, description } = checkIsHoliday(dateStr, events);
      const dayOfWeekIndex = currentDay.getDay();
      let dayKey = DAY_KEY_MAP[dayOfWeekIndex];
      const event = events[dateStr];
      if (event?.type === 'schoolDay' && event?.scheduleDay) dayKey = event.scheduleDay;
      const termSemester = termKey === 'term1' ? '1' : '2';
      const periodsToday = selectedSemester === 'annual'
        ? (courseSchedule[`${termSemester}:${dayKey}`] || courseSchedule[`all:${dayKey}`] || [])
        : (courseSchedule[dayKey] || []);
      const hasAttendanceRecord = Object.values(studentCourseDailyStatus||{}).some(dates => dates && dates[dateStr]);
      const isActuallyHoliday = isHoliday;
      const isSession = (!isActuallyHoliday && periodsToday.length>0) || hasAttendanceRecord;
      if (isSession) {
        const periodsToSession = periodsToday.length>0 ? periodsToday : [0];
        periodsToSession.forEach((p, pIdx) => {
          if (pIdx===0) {
            annualHourCounter++; termHourCounter++;
            termSessionBuffer.push({ date:new Date(currentDay), dateStr, isSession:true, period:p });
          }
        });
      } else {
        termSessionBuffer.push({ date:new Date(currentDay), dateStr, isSession:false, isHoliday:isActuallyHoliday });
      }
      currentDay.setUTCDate(currentDay.getUTCDate()+1);
    }
    for (let i=0;i<termSessionBuffer.length;i+=SESSIONS_PER_PAGE) {
      const chunk = termSessionBuffer.slice(i, i+SESSIONS_PER_PAGE);
      while (chunk.length < SESSIONS_PER_PAGE) chunk.push(null);
      allPages.push({ days: chunk, term: termKey==='term1'?'1':'2', termTotalHours: termHourCounter });
    }
  }
  return allPages;
}

function buildStudentAttendanceSummaries(students, attendancePages, studentCourseDailyStatus) {
  const summaries = {};
  if (!students.length || !attendancePages.length) return summaries;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  students.forEach(student => {
    const statusMap = studentCourseDailyStatus[student.id] || {};
    const summary = { elapsed: { present:0, absent:0, late:0, leave:0, totalPossibleHours:0, percentage:0 } };
    attendancePages.forEach(page => {
      page.days.forEach(day => {
        if (day && day.isSession) {
          if (!isStudentEnrolledOnDay(student, day.dateStr)) return;
          const status = statusMap[day.dateStr];
          const isElapsed = day.dateStr <= todayStr;
          if (isElapsed) {
            summary.elapsed.totalPossibleHours++;
            if (status==='present') summary.elapsed.present++;
            else if (status==='late') summary.elapsed.late++;
            else if (status==='leave') summary.elapsed.leave++;
            else summary.elapsed.absent++;
          }
        }
      });
    });
    const elapsedTotal = summary.elapsed.totalPossibleHours;
    summary.elapsed.percentage = elapsedTotal>0 ? ((summary.elapsed.present+summary.elapsed.late+summary.elapsed.leave)/elapsedTotal)*100 : 0;
    summaries[student.id] = summary;
  });
  return summaries;
}
function computeAttendanceEligibility(summaries) {
  const result = {};
  Object.entries(summaries).forEach(([id, summary]) => {
    const b = summary.elapsed;
    const presentHours = b.present + b.late + b.leave;
    result[id] = { percentage: b.percentage, presentHours, totalHours: b.totalPossibleHours, belowThreshold: b.percentage < 80 };
  });
  return result;
}

// ---- Build inputs ----
const roomOf = (e) => String(e.room || e.groupName || '').trim();
const room2Ids = new Set(enrollments.filter(e => roomOf(e)==='2').map(e=>e.studentId));
console.log(`Room2 enrolled: ${room2Ids.size}`);

const buildDailyStatus = (records) => {
  const dailyStatus = {};
  records.forEach(rec => {
    const studentId = rec.studentId;
    const dateVal = rec.date ? new Date(rec.date) : null;
    if (!studentId || !dateVal) return;
    const dateStr = toDateKey(dateVal);
    const status = rec.status;
    if (!dailyStatus[studentId]) dailyStatus[studentId] = {};
    const current = dailyStatus[studentId][dateStr];
    if (!current || (MS_STATUS_SEVERITY[status]??0) >= (MS_STATUS_SEVERITY[current]??0)) {
      dailyStatus[studentId][dateStr] = status;
    }
  });
  return dailyStatus;
};
const globalDailyStatus = buildDailyStatus(attendanceRecords);
const scopedDailyStatus = (ids) => { const out={}; ids.forEach(id=>{ if(globalDailyStatus[id]) out[id]=globalDailyStatus[id]; }); return out; };

// Corrected schedule for group2 (room2): tue-1, thu-0, mon-2
const scheduleRoom2 = { sun:[],mon:[2],tue:[1],wed:[],thu:[0],fri:[],sat:[] };
const semesterScope = '1';
const classKey = 'm1';

const studentsRoom2 = Array.from(room2Ids).map(id => ({ id }));
const room2Scoped = scopedDailyStatus(room2Ids);
const pages = buildAttendancePages(calendarData, scheduleRoom2, semesterScope, classKey, room2Scoped);
const summaries = buildStudentAttendanceSummaries(studentsRoom2, pages, globalDailyStatus);
const eligibility = computeAttendanceEligibility(summaries);

const TARGET = 'thcaMNlzvLcM2bcKcJjd';
console.log('Target student result:', JSON.stringify(eligibility[TARGET], null, 2));
const belowCount = Object.values(eligibility).filter(e=>e.belowThreshold).length;
console.log(`Room2 total: ${studentsRoom2.length}, below80%: ${belowCount}`);

// dump a few session pages for sanity check
console.log('\nSession dates in room2 schedule (first 20):');
let count=0;
pages.forEach(p => p.days.forEach(d => { if(d&&d.isSession&&count<20){ console.log(d.dateStr); count++; } }));
console.log(`Total session days across all pages: ${pages.reduce((s,p)=>s+p.days.filter(d=>d&&d.isSession).length,0)}`);

// how many of TARGET's own dates exist in room2Scoped
console.log(`\nTarget student own recorded dates count: ${Object.keys(room2Scoped[TARGET]||{}).length}`);
console.log('Sample of target dates:', Object.entries(room2Scoped[TARGET]||{}).slice(0,5));

console.log('\n\n========= PER-STUDENT dailyStatus test (hasAttendanceRecord scoped to just this student) =========');
const targetOnly = { [TARGET]: room2Scoped[TARGET] };
const pages2 = buildAttendancePages(calendarData, scheduleRoom2, semesterScope, classKey, targetOnly);
const summaries2 = buildStudentAttendanceSummaries([{id:TARGET}], pages2, globalDailyStatus);
const eligibility2 = computeAttendanceEligibility(summaries2);
console.log('Target with per-student hasAttendanceRecord:', JSON.stringify(eligibility2[TARGET], null, 2));
console.log('Total session days (per-student pages):', pages2.reduce((s,p)=>s+p.days.filter(d=>d&&d.isSession).length,0));

console.log('\n\n========= FULL SESSION DATE LIST (per-student pages2) =========');
const allSessionDates = [];
pages2.forEach(p => p.days.forEach(d => { if(d&&d.isSession) allSessionDates.push(d.dateStr); }));
console.log('Total:', allSessionDates.length);
const dayOfWeekCount = {};
allSessionDates.forEach(ds => { const dow = new Date(ds+'T00:00:00Z').getUTCDay(); dayOfWeekCount[dow]=(dayOfWeekCount[dow]||0)+1; });
console.log('By day-of-week (0=Sun..6=Sat):', dayOfWeekCount);
console.log(allSessionDates.join(', '));

console.log('\n\n========= DATES SHE HAS NO RECORD FOR (defaulted to absent) =========');
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const herDates = new Set(Object.keys(room2Scoped[TARGET]||{}));
const missingDates = [];
pages2.forEach(p => p.days.forEach(d => {
  if (d && d.isSession && d.dateStr <= todayStr && !herDates.has(d.dateStr)) missingDates.push(d.dateStr);
}));
console.log(`Missing (counted absent by default): ${missingDates.length}`);
missingDates.forEach(ds => {
  const dow = new Date(ds+'T00:00:00Z').getUTCDay();
  console.log(`  ${ds} (dow=${dow})`);
});
