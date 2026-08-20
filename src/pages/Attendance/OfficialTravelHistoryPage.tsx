import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { FaPlane, FaSearch, FaPlus, FaEdit } from "react-icons/fa";
import OfficialTravelPdfButton from "@/components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import { useTheme } from "../../ThemeContext";
import BackButton from "@/components/Shared/BackButton";
import { usePermissions } from "@/hooks/usePermissions";
import { getGroupPersonnel } from "@/utils/schoolUtils";

interface TravelRequest {
    id: string;
    docPath: string;
    startDate: string;
    endDate: string;
    subject: string;
    location: string;
    status: 'approved' | 'rejected' | 'pending';
    createdAt: any;
    // ... other fields as needed for PDF
    [key: string]: any;
}

const OfficialTravelHistoryPage: React.FC = () => {
    const { schoolId } = useParams<{ schoolId: string }>();
    const navigate = useNavigate();
    const { user } = useSelector((state: RootState) => state.auth);
    const { isDarkMode } = useTheme();
    const { isSchoolAdmin } = usePermissions();

    const [requests, setRequests] = useState<TravelRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const formatDate = (date: any) => {
        if (!date) return "-";
        let d: Date;
        if (date.toDate && typeof date.toDate === 'function') {
            d = date.toDate();
        } else {
            d = new Date(date);
        }

        if (isNaN(d.getTime())) return "วันที่ไม่ถูกต้อง";

        return d.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; personnelHeadRoleLabel: string; affiliation: string }>({
        schoolName: "",
        directorName: "",
        deputyName: "",
        personnelHeadName: "",
        personnelHeadRoleLabel: "",
        affiliation: ""
    });

    const fetchRequests = async () => {
        if (!user?.uid || !schoolId) return;

        setLoading(true);
        try {
            // 🚀 Parallel Fetching for better performance
            const schoolRef = doc(firestore, "school-settings", schoolId);
            const [schoolSnap, teachersSnap, studentsSnap] = await Promise.all([
                getDoc(schoolRef),
                getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("uid", "==", user.uid), limit(1))),
                getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("uid", "==", user.uid), limit(1)))
            ]);

            // Set School Info
            if (schoolSnap.exists()) {
                const sData = schoolSnap.data();
                const personnelPersonnel = getGroupPersonnel(sData, 'personnel');
                setSchoolInfo({
                    schoolName: sData.schoolName || "",
                    directorName: (sData.directorPrefix || "") + (sData.directorName || ""),
                    deputyName: (sData.deputyPrefix || "") + (sData.deputyName || ""),
                    personnelHeadName: personnelPersonnel.name,
                    personnelHeadRoleLabel: personnelPersonnel.label,
                    affiliation: sData.affiliation || ""
                });
            }

            // Determine user type and fetch requests
            let userType = '';
            let userDocId = '';

            if (!teachersSnap.empty) {
                userType = 'teachers';
                userDocId = teachersSnap.docs[0].id;
            } else if (!studentsSnap.empty) {
                userType = 'students';
                userDocId = studentsSnap.docs[0].id;
            }

            if (userDocId) {
                const reqRef = collection(firestore, "school-settings", schoolId, userType, userDocId, "travel_summary");
                // 🚀 Optimize query with order and limit
                const q = query(reqRef, orderBy("createdAt", "desc"), limit(50));
                const snapshot = await getDocs(q);
                const fetchedRequests = snapshot.docs.map(d => ({ id: d.id, docPath: d.ref.path, ...d.data() } as TravelRequest));
                setRequests(fetchedRequests);
            }

        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [user, schoolId]);

    // 🚀 useMemo for efficient filtering
    const filteredRequests = React.useMemo(() => {
        const term = searchTerm.toLowerCase();
        return requests.filter(req =>
            (req.subject || "").toLowerCase().includes(term) ||
            (req.location || "").toLowerCase().includes(term)
        );
    }, [requests, searchTerm]);

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto px-4 py-8">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                    <div className="flex items-center gap-4">
                        <BackButton />
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                            <FaPlane className="text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                            ประวัติการขอไปราชการ
                        </h1>
                    </div>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            รายการคำขอและสถานะการอนุมัติทั้งหมดของคุณ
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/school/${schoolId}/official-travel-request`)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium shadow-sm"
                        aria-label="สร้างคำขอไปราชการใหม่"
                    >
                        <FaPlus aria-hidden="true" />
                        สร้างคำขอใหม่
                    </button>
                </header>

                {/* Search Bar */}
                <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            type="text"
                            placeholder="ค้นหาตามชื่อเรื่อง หรือ สถานที่..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            aria-label="ค้นหาประวัติการไปราชการ"
                        />
                    </div>
                </div>

                {/* List Content */}
                <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                    {loading ? (
                        <div className="table-responsive">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 text-sm border-b border-gray-200 dark:border-gray-700">
                                        <th className="px-6 py-4 font-semibold">วันที่เดินทาง</th>
                                        <th className="px-6 py-4 font-semibold">เรื่อง</th>
                                        <th className="px-6 py-4 font-semibold">สถานที่</th>
                                        <th className="px-6 py-4 font-semibold text-center">สถานะ</th>
                                        <th className="px-6 py-4 font-semibold text-right">เอกสาร</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {[...Array(6)].map((_, i) => (
                                        <tr key={`skeleton-${i}`}>
                                            <td className="px-6 py-4"><div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            <td className="px-6 py-4"><div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            <td className="px-6 py-4"><div className="h-3.5 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            <td className="px-6 py-4 text-center"><div className="h-5 w-16 mx-auto rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            <td className="px-6 py-4 text-right"><div className="h-4 w-10 ml-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="p-12 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center">
                            <FaPlane className="text-4xl mb-3 opacity-30" />
                            <p>ไม่พบประวัติการขอไปราชการ</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 text-sm border-b border-gray-200 dark:border-gray-700">
                                        <th className="px-6 py-4 font-semibold">วันที่เดินทาง</th>
                                        <th className="px-6 py-4 font-semibold">เรื่อง</th>
                                        <th className="px-6 py-4 font-semibold">สถานที่</th>
                                        <th className="px-6 py-4 font-semibold text-center">สถานะ</th>
                                        <th className="px-6 py-4 font-semibold text-right">เอกสาร</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {filteredRequests.map((req) => (
                                        <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                                                {formatDate(req.startDate)} - {formatDate(req.endDate)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                                                {req.subject}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                {req.location}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold
                                            ${req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                        req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                                    {req.status === 'approved' ? 'อนุมัติ' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {isSchoolAdmin && (
                                                        <button
                                                            onClick={() => {
                                                                const userType = req.docPath.includes('/teachers/') ? 'teacher' : 'student';
                                                                navigate(`/school/${schoolId}/official-travel-request?type=${userType}&editPath=${encodeURIComponent(req.docPath)}`);
                                                            }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                                                            aria-label="แก้ไขคำขอไปราชการ"
                                                        >
                                                            <FaEdit aria-hidden="true" />
                                                            แก้ไข
                                                        </button>
                                                    )}
                                                    <OfficialTravelPdfButton
                                                        data={req}
                                                        schoolName={schoolInfo.schoolName}
                                                        schoolAffiliation={schoolInfo.affiliation}
                                                        directorName={schoolInfo.directorName}
                                                        deputyName={schoolInfo.deputyName}
                                                        personnelHeadName={schoolInfo.personnelHeadName}
                                                        personnelHeadRoleLabel={schoolInfo.personnelHeadRoleLabel}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default OfficialTravelHistoryPage;
