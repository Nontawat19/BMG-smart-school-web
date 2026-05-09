import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface GradeBookCompletenessBannerProps {
    completenessStats: any;
}

const GradeBookCompletenessBanner: React.FC<GradeBookCompletenessBannerProps> = ({ completenessStats }) => {
    if (!completenessStats?.isReadyForPdf) {
        return null;
    }

    return (
        <div className="mx-6 mt-6 mb-2 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 size={24} />
                </div>
                <div>
                    <h4 className="font-black text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                        ข้อมูลสำคัญครบถ้วนแล้ว!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold opacity-80">คุณสามารถออกไฟล์ PDF ได้ทันที เพราะคะแนน คุณลักษณะ อ่าน/คิด/เขียน และเช็คชื่อครบ 100%</p>
                </div>
            </div>
        </div>
    );
};

export default GradeBookCompletenessBanner;
