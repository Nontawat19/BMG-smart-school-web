import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { MutableRefObject } from 'react';

const MySwal = withReactContent(Swal);

export interface SchedulingProgressOptions {
    cancelRequestedRef: MutableRefObject<boolean>;
    activeWorkerRef: MutableRefObject<Worker | null>;
    activeCancelRef: MutableRefObject<(() => void) | null>;
}

/** Open the fullscreen progress dialog. Returns an `updateProgress` callback. */
export const openSchedulingProgressDialog = (options: SchedulingProgressOptions): void => {
    const { cancelRequestedRef, activeWorkerRef, activeCancelRef } = options;

    MySwal.fire({
        title: 'กำลังเตรียมข้อมูล...',
        html: `
        <div class="space-y-3">
          <div id="progress-message" class="text-sm text-gray-600 dark:text-gray-300">กำลังโหลดข้อมูลครูและรายวิชา...</div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div id="progress-bar" class="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div id="progress-text" class="text-xs text-gray-500 dark:text-gray-400">0%</div>
        </div>
      `,
        allowOutsideClick: false,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'ยกเลิกการจัดตาราง',
        cancelButtonColor: '#6b7280',
        preDeny: () => false,
        didOpen: () => { MySwal.showLoading(); },
        willClose: () => {
            cancelRequestedRef.current = true;
            if (activeWorkerRef.current) {
                activeWorkerRef.current.terminate();
                activeWorkerRef.current = null;
            }
            if (activeCancelRef.current) {
                activeCancelRef.current();
                activeCancelRef.current = null;
            }
        },
    });
};

/** Update progress bar and message text inside the active progress dialog. */
export const updateSchedulingProgress = (
    percentage: number,
    message: string,
    cancelRequestedRef: MutableRefObject<boolean>
): void => {
    if (cancelRequestedRef.current) return;
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const messageEl = document.getElementById('progress-message');

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${percentage}%`;
    if (messageEl) messageEl.textContent = message;
};
