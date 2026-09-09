// TEMPORARY diagnostic page — ตรวจสอบว่าคำร้องแก้ตัว (remediation_requests) ที่ resolved อยู่ตอนนี้เกิดจากการ
// แก้ทีละคนของครูมาตลอดปี (กระจายตามเวลา/หลายคน) หรือถูกแก้พร้อมกันเป็นชุดใหญ่ในช่วงเวลาสั้นๆ (ผิดปกติ) — ใช้
// เป็นข้อมูลประกอบการตัดสินใจก่อน revert อะไร ลบทิ้งได้เมื่อไม่ต้องใช้แล้ว
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

const toDateKey = (ts: any): string => {
    if (!ts) return '(ไม่มีเวลา)';
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if (!d) return '(ไม่มีเวลา)';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const RemediationAuditPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    const runAudit = async () => {
        if (!schoolId) return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const snap = await getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests'));
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            const byStatus: Record<string, number> = {};
            const byGrade: Record<string, number> = {};
            const byFlagType: Record<string, number> = {};
            const byResolvedBy: Record<string, number> = {};
            const byResolvedDay: Record<string, number> = {};

            docs.forEach(d => {
                byStatus[d.status || '(ไม่มีสถานะ)'] = (byStatus[d.status || '(ไม่มีสถานะ)'] || 0) + 1;
                if (d.status === 'resolved') {
                    byGrade[d.originalGrade || '(ไม่มี)'] = (byGrade[d.originalGrade || '(ไม่มี)'] || 0) + 1;
                    byFlagType[d.flagType || '(ไม่มี)'] = (byFlagType[d.flagType || '(ไม่มี)'] || 0) + 1;
                    byResolvedBy[d.resolvedBy || '(ไม่มีผู้แก้)'] = (byResolvedBy[d.resolvedBy || '(ไม่มีผู้แก้)'] || 0) + 1;
                    const day = toDateKey(d.resolvedAt).slice(0, 10);
                    byResolvedDay[day] = (byResolvedDay[day] || 0) + 1;
                }
            });

            const resolvedList = docs
                .filter(d => d.status === 'resolved')
                .sort((a, b) => (b.resolvedAt?.toMillis?.() || 0) - (a.resolvedAt?.toMillis?.() || 0))
                .map(d => ({
                    studentName: d.studentName,
                    studentCode: d.studentCode,
                    subject: d.courseTitle || d.activityName || '-',
                    flagType: d.flagType,
                    originalGrade: d.originalGrade,
                    requestedAt: toDateKey(d.requestedAt),
                    resolvedAt: toDateKey(d.resolvedAt),
                    resolvedBy: d.resolvedBy || '-',
                    requestedBy: d.requestedBy || '-',
                }));

            setResult({
                totalRequests: docs.length,
                byStatus,
                resolvedCount: byStatus['resolved'] || 0,
                byGrade,
                byFlagType,
                byResolvedBy,
                byResolvedDay,
                resolvedList,
            });
        } catch (err: any) {
            console.error(err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto p-6">
                <h1 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">ตรวจสอบคำร้องแก้ตัวที่ resolved (ชั่วคราว)</h1>
                <p className="text-sm text-gray-500 mb-4">
                    ดูว่าคำร้องที่ resolved อยู่ตอนนี้กระจายตามเวลา/ผู้แก้หลายคน (ปกติ) หรือกระจุกช่วงเดียว/คนเดียว (ผิดปกติ)
                </p>
                <button onClick={runAudit} disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 mb-4">
                    {loading ? 'กำลังตรวจสอบ...' : 'เริ่มตรวจสอบ'}
                </button>
                {error && <p className="text-red-600 mb-4">{error}</p>}
                {result && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                <div className="text-xs text-gray-500">คำร้องทั้งหมด</div>
                                <div className="text-xl font-bold">{result.totalRequests}</div>
                            </div>
                            {Object.entries(result.byStatus).map(([status, count]: any) => (
                                <div key={status} className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                    <div className="text-xs text-gray-500">{status}</div>
                                    <div className="text-xl font-bold">{count}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <h2 className="font-bold mb-1 text-sm">แยกตามเกรดเดิม (เฉพาะ resolved)</h2>
                                <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded-lg overflow-x-auto">{JSON.stringify(result.byGrade, null, 2)}</pre>
                            </div>
                            <div>
                                <h2 className="font-bold mb-1 text-sm">แยกตามประเภท (course/club/...)</h2>
                                <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded-lg overflow-x-auto">{JSON.stringify(result.byFlagType, null, 2)}</pre>
                            </div>
                            <div>
                                <h2 className="font-bold mb-1 text-sm">แยกตามผู้แก้ (resolvedBy uid)</h2>
                                <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded-lg overflow-x-auto">{JSON.stringify(result.byResolvedBy, null, 2)}</pre>
                            </div>
                        </div>

                        <div>
                            <h2 className="font-bold mb-1 text-sm">แยกตามวันที่แก้ (resolvedAt) — ดูว่ากระจุกวันเดียวไหม</h2>
                            <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded-lg overflow-x-auto">{JSON.stringify(result.byResolvedDay, null, 2)}</pre>
                        </div>

                        <div>
                            <h2 className="font-bold mb-1 text-sm">รายการ resolved ทั้งหมด (ใหม่สุดก่อน) — {result.resolvedList.length} รายการ</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-200 dark:bg-gray-800">
                                            <th className="p-2 text-left border">นักเรียน</th>
                                            <th className="p-2 text-left border">วิชา/กิจกรรม</th>
                                            <th className="p-2 text-left border">ประเภท</th>
                                            <th className="p-2 text-left border">เกรดเดิม</th>
                                            <th className="p-2 text-left border">ยื่นเมื่อ</th>
                                            <th className="p-2 text-left border">แก้เมื่อ</th>
                                            <th className="p-2 text-left border">ผู้แก้</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.resolvedList.map((r: any, i: number) => (
                                            <tr key={i} className="border-b dark:border-gray-700">
                                                <td className="p-2 border">{r.studentName} ({r.studentCode})</td>
                                                <td className="p-2 border">{r.subject}</td>
                                                <td className="p-2 border">{r.flagType}</td>
                                                <td className="p-2 border">{r.originalGrade}</td>
                                                <td className="p-2 border">{r.requestedAt}</td>
                                                <td className="p-2 border">{r.resolvedAt}</td>
                                                <td className="p-2 border">{r.resolvedBy}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default RemediationAuditPage;
