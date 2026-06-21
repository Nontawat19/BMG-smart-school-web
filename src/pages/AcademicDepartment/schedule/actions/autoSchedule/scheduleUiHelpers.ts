import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

export const escapePrecheckHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

export const showPrecheckReport = async (
    fatalIssues: string[],
    warningIssues: string[]
): Promise<void> => {
    const escapeHtml = (value: string) =>
        value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    const listHtml = (items: string[], tone: 'red' | 'amber') =>
        items.length > 0
            ? `
                <div class="text-left mb-4">
                    <p class="text-xs font-black uppercase tracking-widest ${tone === 'red' ? 'text-red-600' : 'text-amber-600'} mb-2">
                        ${tone === 'red' ? 'ต้องแก้ก่อนจัดตาราง' : 'ควรตรวจสอบ'}
                    </p>
                    <div class="max-h-52 overflow-auto rounded-xl border ${tone === 'red' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'} p-3">
                        <ul class="list-disc pl-5 space-y-1 text-xs ${tone === 'red' ? 'text-red-800' : 'text-amber-800'}">
                            ${items.slice(0, 20).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                            ${items.length > 20 ? `<li>และอีก ${items.length - 20} รายการ...</li>` : ''}
                        </ul>
                    </div>
                </div>
            `
            : '';

    await MySwal.fire({
        icon: fatalIssues.length > 0 ? 'error' : 'warning',
        title: fatalIssues.length > 0 ? 'ข้อมูลยังจัดตารางไม่ได้' : 'พบข้อมูลที่ควรตรวจสอบ',
        html: `
            <div class="font-sans">
                <p class="text-sm text-gray-600 mb-4">
                    ระบบตรวจข้อมูลก่อนเริ่มจัดตาราง เพื่อป้องกันการคำนวณนานโดยไม่มีทางสำเร็จ
                </p>
                ${listHtml(fatalIssues, 'red')}
                ${listHtml(warningIssues, 'amber')}
            </div>
        `,
        width: '640px',
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: fatalIssues.length > 0 ? '#ef4444' : '#f59e0b'
    });
};

export interface AutoScheduleResultParams {
    completionTitle: string;
    schedulingScopeLabel: string;
    actualPlacedPeriods: number;
    temporaryPlacedPeriods: number;
    totalPeriodsRequired: number;
    actualPlacedRate: number;
    temporaryAssistedRate: number;
    unplacedCount: number;
    temporaryTaskCount: number;
    forcedTemporaryTaskCount: number;
    unresolvedTaskCount: number;
    temporaryTaskSummaries: Array<{
        code: string;
        title: string;
        classes: string;
        teachers: string;
        hasTemporarySlots: boolean;
        isForcedTemporary: boolean;
        conflictCount: number;
        slots: string;
    }>;
    validationIssueCount: number;
    validationPreview: Array<{ message: string; recommendation: string }>;
    onConfirm?: () => void;
}

export const showAutoScheduleResultModal = async (params: AutoScheduleResultParams): Promise<void> => {
    const {
        completionTitle, schedulingScopeLabel,
        actualPlacedPeriods, temporaryPlacedPeriods, totalPeriodsRequired,
        actualPlacedRate, temporaryAssistedRate,
        unplacedCount, temporaryTaskCount, forcedTemporaryTaskCount, unresolvedTaskCount,
        temporaryTaskSummaries, validationIssueCount, validationPreview, onConfirm,
    } = params;

    await MySwal.fire({
        icon: undefined,
        title: undefined,
        html: `
          <div class="text-center font-sans px-2">
            <div class="mb-5">
              <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
              <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">${completionTitle}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">ระบบได้ประมวลผลตารางสอน${schedulingScopeLabel} และตรวจคุณภาพหลังจัดตารางแล้ว</p>
            </div>
            <div class="grid grid-cols-5 gap-3 mb-6">
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <p class="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold mb-1">ลงจริง</p>
                <p class="text-2xl font-black text-blue-700 dark:text-blue-300 pointer-events-none">${actualPlacedPeriods}</p>
              </div>
              <div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/30">
                <p class="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-1">ชั่วคราว</p>
                <p class="text-2xl font-black text-amber-700 dark:text-amber-300 pointer-events-none">${temporaryPlacedPeriods}</p>
              </div>
              <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <p class="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold mb-1">จากทั้งหมด</p>
                <p class="text-2xl font-black text-indigo-700 dark:text-indigo-300 pointer-events-none">${totalPeriodsRequired}</p>
              </div>
              <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                <p class="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-1">ลงจริง</p>
                <p class="text-2xl font-black text-emerald-700 dark:text-emerald-300 pointer-events-none">${actualPlacedRate}%</p>
              </div>
              <div class="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-100 dark:border-sky-800/30">
                <p class="text-[10px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold mb-1">ช่วยรวม</p>
                <p class="text-2xl font-black text-sky-700 dark:text-sky-300 pointer-events-none">${temporaryAssistedRate}%</p>
              </div>
            </div>
            ${unplacedCount > 0 ? `
              <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-700/50 flex items-start gap-3 text-left mb-4">
                 <div class="mt-0.5 text-amber-500 shrink-0">⚠️</div>
                 <div>
                    <p class="text-sm font-bold text-amber-800 dark:text-amber-200">ยังจัดลงจริงไม่ได้ ${unplacedCount} รายการ</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-relaxed">
                      ${temporaryTaskCount > 0 ? `วางชั่วคราวได้ ${temporaryTaskCount} รายการ` : 'ไม่มีรายการที่วางชั่วคราวได้'}
                      ${forcedTemporaryTaskCount > 0 ? ` โดยเป็นคาบที่มีชน ${forcedTemporaryTaskCount} รายการ` : ''}
                      ${unresolvedTaskCount > 0 ? ` และยังไม่มีคาบที่ไม่ชนกัน ${unresolvedTaskCount} รายการ` : ''}
                    </p>
                    <div class="mt-2 max-h-40 overflow-auto rounded-lg bg-white/70 dark:bg-black/10 border border-amber-200/70 dark:border-amber-700/40">
                      ${temporaryTaskSummaries.slice(0, 12).map(item => `
                        <div class="px-2 py-1.5 border-b last:border-b-0 border-amber-100 dark:border-amber-800/40">
                          <p class="text-[11px] font-black text-amber-900 dark:text-amber-100">${escapePrecheckHtml(item.code)} ${escapePrecheckHtml(item.title)}</p>
                          <p class="text-[10px] text-amber-700 dark:text-amber-300">ชั้น/ห้อง: ${escapePrecheckHtml(item.classes)} | ครู: ${escapePrecheckHtml(item.teachers)} | ${item.hasTemporarySlots ? 'ชั่วคราว' : 'สถานะ'}: ${escapePrecheckHtml(item.slots)}</p>
                        </div>
                      `).join('')}
                      ${temporaryTaskSummaries.length > 12 ? `<div class="px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">และอีก ${temporaryTaskSummaries.length - 12} รายการ</div>` : ''}
                    </div>
                 </div>
              </div>
            ` : ''}
            ${validationIssueCount > 0 && validationPreview.length > 0 ? `
              <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-700/50 text-left mb-4">
                <p class="text-sm font-bold text-red-800 dark:text-red-200">พบประเด็นหลังตรวจตาราง ${validationIssueCount} รายการ</p>
                <div class="mt-2 max-h-36 overflow-auto rounded-lg bg-white/70 dark:bg-black/10 border border-red-200/70 dark:border-red-700/40">
                  ${validationPreview.map(issue => `
                    <div class="px-2 py-1.5 border-b last:border-b-0 border-red-100 dark:border-red-800/40">
                      <p class="text-[11px] font-black text-red-900 dark:text-red-100">${escapePrecheckHtml(issue.message)}</p>
                      <p class="text-[10px] text-red-700 dark:text-red-300">${escapePrecheckHtml(issue.recommendation)}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            <div class="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5 mt-2 font-medium">
               <span class="text-emerald-500">💾</span>
               <span>บันทึกอัตโนมัติเรียบร้อย</span>
               <span class="text-gray-300 dark:text-gray-600">•</span>
               <span>อัปเดตจริง ${actualPlacedPeriods} คาบ${temporaryPlacedPeriods > 0 ? ` / ช่วยชั่วคราว ${temporaryPlacedPeriods} คาบ` : ''}</span>
            </div>
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#10b981',
        buttonsStyling: true,
        customClass: {
            popup: 'rounded-3xl shadow-2xl overflow-hidden dark:bg-[#2a2b2f]',
            confirmButton: 'rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-500/20 text-sm'
        },
        width: '550px',
        padding: '0'
    }).then(() => {
        onConfirm?.();
    });
};
