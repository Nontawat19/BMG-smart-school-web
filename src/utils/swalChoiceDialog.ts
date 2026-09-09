// กล่องเลือกตัวเลือกสำหรับ SweetAlert2 ที่ออกแบบมาเพื่อแก้ปัญหา dropdown บนเบราว์เซอร์ (โดยเฉพาะ macOS)
// ซึ่ง <select> native ของเบราว์เซอร์จะเพี้ยนสีตามธีม OS ไม่ตรงกับโหมดมืด/โหมดสว่างของเว็บ
// คอมโพเนนต์นี้ใช้ DOM แท้ที่ควบคุมสี 100% ทั้ง Light Mode และ Dark Mode และจัดวางใน Flow ป้องกันการโดนตัด (overflow clip)
import Swal from 'sweetalert2';

let choiceDialogSeq = 0;

export interface ChoiceDialogConfig {
    title: string;
    html?: string;
    options: Record<string, string>;
    placeholder?: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    confirmButtonColor?: string;
}

export interface ChoiceDialogResult {
    value?: string;
    isConfirmed: boolean;
}

export const showChoiceDialog = async (config: ChoiceDialogConfig): Promise<ChoiceDialogResult> => {
    const uid = `swal-choice-${Date.now()}-${++choiceDialogSeq}`;
    const optionEntries = Object.entries(config.options);
    const placeholderText = config.placeholder || 'เลือก...';
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let cleanupPortal: (() => void) | null = null;

    const result = await Swal.fire({
        title: config.title,
        customClass: {
            popup: 'swal-choice-popup',
            htmlContainer: 'swal-choice-html',
        },
        html: `
            <style>
                .swal-choice-popup {
                    overflow: visible !important;
                    border-radius: 16px !important;
                    padding: 20px !important;
                }
                .swal-choice-html {
                    overflow: visible !important;
                    margin: 0.8em 0.5em 0.3em !important;
                    text-align: left !important;
                }
                .swal-choice-wrap {
                    text-align: left;
                    margin-top: 10px;
                    width: 100%;
                    position: relative;
                }
                .swal-choice-btn {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1.5px solid #d1d5db;
                    background: #ffffff;
                    color: #111827;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    list-style: none;
                    user-select: none;
                    box-sizing: border-box;
                    transition: all 0.15s ease;
                }
                .swal-choice-btn::-webkit-details-marker {
                    display: none;
                }
                .swal-choice-btn:hover {
                    border-color: #6366f1;
                }
                .swal-choice-wrap[open] .swal-choice-btn {
                    border-color: #4f46e5;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
                }
                .swal-choice-chevron {
                    transition: transform 0.2s ease;
                    font-size: 12px;
                    color: #6b7280;
                    display: inline-block;
                }
                .swal-choice-wrap[open] .swal-choice-chevron {
                    transform: rotate(180deg);
                }
                .swal-choice-list {
                    /* ย้ายออกไปเป็นลูกของ <body> ตรงๆ ด้วย JS (ดู didOpen) แล้วใช้ position:fixed คำนวณตำแหน่งเอง
                       แทนการลอยทับอยู่ข้างในกล่องโต้ตอบ — ลองใช้ position:absolute+z-index ภายใน popup มาแล้ว
                       ยังโดนปุ่ม บันทึก/ยกเลิก (ซึ่งอยู่ใน stacking context คนละชั้นของ SweetAlert2) บังอยู่ดี
                       ย้ายออกมานอก DOM ของ popup เลยจะได้ไม่ติด stacking context ของ popup อีกต่อไป */
                    position: fixed;
                    z-index: 999999;
                    border-radius: 10px;
                    border: 1.5px solid #e5e7eb;
                    background: #ffffff;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                    max-height: 200px;
                    overflow-y: auto;
                    padding: 4px;
                    box-sizing: border-box;
                    display: none;
                }
                .swal-choice-option {
                    padding: 10px 14px;
                    font-size: 14px;
                    color: #374151;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: all 0.12s ease;
                    margin-bottom: 2px;
                }
                .swal-choice-option:hover {
                    background: #f3f4f6;
                    color: #111827;
                }
                .swal-choice-option.selected {
                    background: #eef2ff;
                    color: #4338ca;
                    font-weight: 700;
                }
                .swal-choice-check {
                    font-size: 13px;
                    font-weight: bold;
                    color: #4f46e5;
                }

                /* Dark mode overrides */
                html.dark .swal-choice-btn {
                    background: #25272c;
                    color: #f3f4f6;
                    border-color: #4b5563;
                }
                html.dark .swal-choice-btn:hover {
                    border-color: #818cf8;
                }
                html.dark .swal-choice-wrap[open] .swal-choice-btn {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
                }
                html.dark .swal-choice-chevron {
                    color: #9ca3af;
                }
                html.dark .swal-choice-list {
                    background: #1e1f24;
                    border-color: #374151;
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
                }
                html.dark .swal-choice-option {
                    color: #d1d5db;
                }
                html.dark .swal-choice-option:hover {
                    background: #2d3039;
                    color: #ffffff;
                }
                html.dark .swal-choice-option.selected {
                    background: #3730a3;
                    color: #ffffff;
                }
                html.dark .swal-choice-check {
                    color: #a5b4fc;
                }
            </style>
            ${config.html || ''}
            <details class="swal-choice-wrap" id="${uid}">
                <summary class="swal-choice-btn">
                    <span id="${uid}-label">${escapeHtml(placeholderText)}</span>
                    <span class="swal-choice-chevron">▼</span>
                </summary>
                <div class="swal-choice-list" id="${uid}-list">
                    ${optionEntries.map(([v, label]) => `
                        <div class="swal-choice-option" data-value="${escapeHtml(v)}">
                            <span>${escapeHtml(label)}</span>
                            <span class="swal-choice-check" style="display:none;">✓</span>
                        </div>
                    `).join('')}
                </div>
            </details>
            <input type="hidden" id="${uid}-value" />
        `,
        showCancelButton: true,
        confirmButtonText: config.confirmButtonText || 'บันทึก',
        cancelButtonText: config.cancelButtonText || 'ยกเลิก',
        confirmButtonColor: config.confirmButtonColor || '#4f46e5',
        didOpen: () => {
            const details = document.getElementById(uid) as HTMLDetailsElement | null;
            const summary = details?.querySelector('summary');
            const list = document.getElementById(`${uid}-list`);
            const label = document.getElementById(`${uid}-label`);
            const hidden = document.getElementById(`${uid}-value`) as HTMLInputElement | null;
            if (!details || !summary || !list || !label || !hidden) return;

            // ย้าย list ออกไปเป็นลูกของ <body> ตรงๆ (portal) แล้วคำนวณตำแหน่งเอง — เพื่อให้พ้น stacking
            // context ของ SweetAlert2 popup ไปเลย ไม่ต้องแย่ง z-index กับปุ่ม บันทึก/ยกเลิก อีก
            document.body.appendChild(list);

            const positionList = () => {
                const rect = summary.getBoundingClientRect();
                list.style.left = `${rect.left}px`;
                list.style.top = `${rect.bottom + 8}px`;
                list.style.width = `${rect.width}px`;
            };
            const onToggle = () => {
                list.style.display = details.open ? 'block' : 'none';
                if (details.open) positionList();
            };
            const onReposition = () => { if (details.open) positionList(); };
            const closeOnOutsideClick = (e: MouseEvent) => {
                if (details.open && !details.contains(e.target as Node) && !list.contains(e.target as Node)) {
                    details.open = false;
                }
            };

            details.addEventListener('toggle', onToggle);
            window.addEventListener('scroll', onReposition, true);
            window.addEventListener('resize', onReposition);
            document.addEventListener('click', closeOnOutsideClick);

            list.querySelectorAll<HTMLElement>('.swal-choice-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    const val = opt.dataset.value || '';
                    hidden.value = val;
                    label.textContent = opt.querySelector('span')?.textContent || '';
                    details.open = false;
                    list.querySelectorAll('.swal-choice-option').forEach(o => {
                        o.classList.remove('selected');
                        const check = o.querySelector<HTMLElement>('.swal-choice-check');
                        if (check) check.style.display = 'none';
                    });
                    opt.classList.add('selected');
                    const myCheck = opt.querySelector<HTMLElement>('.swal-choice-check');
                    if (myCheck) myCheck.style.display = 'inline';
                });
            });

            cleanupPortal = () => {
                details.removeEventListener('toggle', onToggle);
                window.removeEventListener('scroll', onReposition, true);
                window.removeEventListener('resize', onReposition);
                document.removeEventListener('click', closeOnOutsideClick);
                list.remove();
            };
        },
        willClose: () => {
            cleanupPortal?.();
        },
        preConfirm: () => {
            const hidden = document.getElementById(`${uid}-value`) as HTMLInputElement | null;
            const v = hidden?.value || '';
            if (!v) {
                Swal.showValidationMessage('กรุณาเลือกผลการประเมินก่อนบันทึก');
                return false;
            }
            return v;
        },
    });

    return { value: result.value as string | undefined, isConfirmed: !!result.isConfirmed };
};
