import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { firestore } from "@/firebase";
import { collection, getDocs, query, where, doc, updateDoc, getDoc, writeBatch } from "firebase/firestore";
import Swal from "sweetalert2";
import { RootState } from "../../store";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { MessageSquare, Save, Search, Key, CheckCircle, XCircle, X, ExternalLink, Bell } from "lucide-react";
import ProfilePlaceholder from "../../assets/profile.png";

interface Teacher {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  homeroomGrade?: string;
  room?: string;
  profileImageUrl?: string;
  lineChannelAccessToken?: string;
  lineChannelSecret?: string;
  lineChannelId?: string;
  lineOABasicId?: string; // LINE ID like @123xyz
  liffId?: string; // LINE LIFF ID
  enableNotification?: boolean;
}

interface SchoolData {
  id: string;
  schoolName: string;
}

interface TeacherGroup {
  key: string;
  grade: string;
  room: string;
  label: string;
  teachers: Teacher[];
  configSource: Teacher;
}

const systemConfigDetails: Record<string, { name: string, description: string }> = {
  school: { name: 'LINE OA หลักของโรงเรียน', description: 'บัญชีทางการหลักสำหรับติดต่อสอบถามและประชาสัมพันธ์ภาพรวมของโรงเรียน' },
  general: { name: 'งานบริหารทั่วไป', description: 'รับ-ส่งหนังสือราชการ และการแจ้งเตือนทั่วไปของฝ่าย' },
  academic: { name: 'งานบริหารวิชาการ', description: 'แจ้งเตือนเกี่ยวกับการจัดการหลักสูตร ตารางสอน และงานวิชาการ' },
  budget: { name: 'งานบริหารงบประมาณ', description: 'แจ้งเตือนเกี่ยวกับการเงิน บัญชี และพัสดุ' },
  personnel: { name: 'งานบริหารบุคคล', description: 'แจ้งเตือนเกี่ยวกับการลา สรุปเวลา และข้อมูลบุคลากร' },
};

const normalizeHomeroomValue = (value?: string | number | null) => String(value ?? "").trim();

const splitHomeroom = (teacher: Partial<Teacher> & Record<string, any>) => {
  const rawGrade = normalizeHomeroomValue(teacher.homeroomGrade);
  const gradeParts = rawGrade.split("/").map((part) => part.trim()).filter(Boolean);
  const grade = gradeParts[0] || rawGrade || "ไม่ระบุชั้น";
  const room = [
    gradeParts[1],
    teacher.room,
    teacher.roomNumber,
    teacher.classroom,
    teacher.homeroomRoom,
    teacher.section,
  ]
    .map((value) => normalizeHomeroomValue(value))
    .find(Boolean) || "";

  return { grade, room, label: room ? `${grade}/${room}` : grade };
};

const hasLineConfig = (teacher?: Partial<Teacher>) =>
  Boolean(teacher?.lineChannelAccessToken && teacher?.lineChannelSecret);

const getTeacherDisplayName = (teacher: Partial<Teacher>) =>
  `${teacher.title || ""}${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || "ไม่ระบุชื่อ";

const LineOAManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const currentSchoolId = currentUser?.schoolId;

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");

  // 📌 เปลี่ยน: State สำหรับเก็บ Config ของระบบทั้งหมด
  const [systemConfigs, setSystemConfigs] = useState<Record<string, Teacher>>({});

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<{ type: 'teacher-group'; group: TeacherGroup } | { type: 'system'; key: string; name: string } | null>(null);
  const [formData, setFormData] = useState<Partial<Teacher>>({
    lineChannelAccessToken: "",
    lineChannelSecret: "",
    lineChannelId: "",
    lineOABasicId: "",
    liffId: "",
    enableNotification: false
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch Schools List
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const q = query(collection(firestore, "school-settings"));
        const snapshot = await getDocs(q);
        const schoolList = snapshot.docs.map(doc => ({
          id: doc.id,
          schoolName: doc.data().schoolName || "ไม่ระบุชื่อโรงเรียน"
        }));
        setSchools(schoolList);

        if (currentSchoolId) {
          setSelectedSchoolId(currentSchoolId);
        } else if (schoolList.length > 0) {
          setSelectedSchoolId(schoolList[0].id);
        }
      } catch (error) {
        console.error("Error fetching schools:", error);
      }
    };
    fetchSchools();
  }, [currentSchoolId]);

  const fetchData = async () => {
    if (!selectedSchoolId) return;
    setIsLoading(true);
    try {
      // 1. Fetch teachers who are homeroom teachers
      const teacherQuery = query(
        collection(firestore, "school-settings", selectedSchoolId, "teachers"),
        where("isHomeroomTeacher", "==", true)
      );

      const teacherSnapshot = await getDocs(teacherQuery);
      const teacherData = teacherSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
      teacherData.sort((a, b) => (a.homeroomGrade || "").localeCompare(b.homeroomGrade || ""));
      setTeachers(teacherData);

      // 2. Fetch system-wide settings (e.g., general affairs)
      const schoolDocRef = doc(firestore, "school-settings", selectedSchoolId);
      const schoolDocSnap = await getDoc(schoolDocRef);
      if (schoolDocSnap.exists()) {
        const schoolData = schoolDocSnap.data() as any;
        setSystemConfigs(schoolData.lineOASettings || {});
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      Swal.fire("Error", "ไม่สามารถโหลดข้อมูลได้", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSchoolId]);

  const handleOpenModal = (target: { type: 'teacher-group', group: TeacherGroup } | { type: 'system', key: string, name: string }) => {
    setSelectedTarget(target);
    let configData: Partial<Teacher> = {};

    if (target.type === 'teacher-group') {
      configData = target.group.configSource;
    } else if (target.type === 'system') {
      // 💡 เปลี่ยน: ดึง config จาก state ของ systemConfigs
      configData = systemConfigs[target.key] || {};
    }

    setFormData({
      lineChannelAccessToken: configData.lineChannelAccessToken || "",
      lineChannelSecret: configData.lineChannelSecret || "",
      lineChannelId: configData.lineChannelId || "",
      lineOABasicId: configData.lineOABasicId || "",
      liffId: configData.liffId || "",
      enableNotification: configData.enableNotification || false
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTarget(null);
    setFormData({ lineChannelAccessToken: "", lineChannelSecret: "", lineChannelId: "", lineOABasicId: "", liffId: "", enableNotification: false });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId || !selectedTarget) return;

    try {
      if (selectedTarget.type === 'teacher-group') {
        const updatedData = {
          lineChannelAccessToken: formData.lineChannelAccessToken,
          lineChannelSecret: formData.lineChannelSecret,
          lineChannelId: formData.lineChannelId,
          lineOABasicId: formData.lineOABasicId,
          liffId: formData.liffId,
          enableNotification: formData.enableNotification
        };

        const batch = writeBatch(firestore);
        selectedTarget.group.teachers.forEach((teacher) => {
          const teacherRef = doc(firestore, "school-settings", selectedSchoolId, "teachers", teacher.id);
          batch.update(teacherRef, updatedData);
        });
        await batch.commit();

        // Update local state for instant feedback
        setTeachers(prev => prev.map(t =>
          selectedTarget.group.teachers.some((teacher) => teacher.id === t.id)
            ? { ...t, ...updatedData }
            : t
        ));
      } else if (selectedTarget.type === 'system') {
        const schoolDocRef = doc(firestore, "school-settings", selectedSchoolId);
        // Use dot notation to update a specific key in a map field
        const updatePath = `lineOASettings.${selectedTarget.key}`;
        await updateDoc(schoolDocRef, {
          [updatePath]: formData
        });

        // Update local state
        setSystemConfigs(prev => ({
          ...prev,
          [selectedTarget.key]: { ...(prev[selectedTarget.key] || {}), ...formData } as any
        }));
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'ข้อมูล LINE OA ถูกบันทึกเรียบร้อยแล้ว',
        timer: 1500,
        showConfirmButton: false
      });

      handleCloseModal();
      // Removed full fetchData() call for better performance
    } catch (error) {
      console.error("Error saving LINE OA settings:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการบันทึก", "error");
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter(t =>
      `${t.firstName} ${t.lastName} ${t.homeroomGrade}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [teachers, searchTerm]);

  const groupedTeachers = useMemo(() => {
    const groups: Record<string, Teacher[]> = {};
    filteredTeachers.forEach(teacher => {
      const grade = teacher.homeroomGrade || "ไม่ระบุชั้น";
      if (!groups[grade]) groups[grade] = [];
      groups[grade].push(teacher);
    });
    return groups;
  }, [filteredTeachers]);

  const groupedHomeroomTeachers = useMemo(() => {
    const groups: Record<string, TeacherGroup[]> = {};

    Object.keys(groupedTeachers).forEach((gradeKey) => {
      const homeroomMap = new Map<string, Teacher[]>();

      groupedTeachers[gradeKey].forEach((teacher) => {
        const homeroom = splitHomeroom(teacher as Teacher & Record<string, any>);
        const groupKey = `${homeroom.grade}__${homeroom.room || "-"}`;
        const current = homeroomMap.get(groupKey) || [];
        current.push(teacher);
        homeroomMap.set(groupKey, current);
      });

      groups[gradeKey] = Array.from(homeroomMap.entries())
        .map(([key, homeroomTeachers]) => {
          const configSource = homeroomTeachers.find((teacher) => hasLineConfig(teacher)) || homeroomTeachers[0];
          const homeroom = splitHomeroom(configSource as Teacher & Record<string, any>);

          return {
            key,
            grade: homeroom.grade,
            room: homeroom.room,
            label: homeroom.label,
            teachers: homeroomTeachers,
            configSource,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    });

    return groups;
  }, [groupedTeachers]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300">
      <Navbar />
      <LeftSidebar
        isCollapsed={isSidebarCollapsed}
        toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobile={isMobile}
        onClose={() => setIsSidebarCollapsed(true)}
      />

      <main
        className={`pt-[80px] p-6 transition-all duration-300 ${!isMobile && !isSidebarCollapsed ? "ml-[280px]" : "ml-0"
          }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-green-500" />
              จัดการระบบแจ้งเตือน LINE OA
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              ตั้งค่า API Key ของ LINE Official Account สำหรับระบบส่วนกลางและรายชั้นเรียน
            </p>
          </div>

          {/* School Selector */}
          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกโรงเรียน</label>
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                disabled={!!currentSchoolId}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {schools.map(school => (
                  <option key={school.id} value={school.id}>{school.schoolName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 📌 เพิ่ม: ส่วนตั้งค่าระบบส่วนกลาง */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">ตั้งค่าระบบส่วนกลาง (ฝ่ายต่างๆ)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(systemConfigDetails).map(([key, details]) => {
                const config = systemConfigs[key];
                const isConfigured = !!config?.lineChannelAccessToken && !!config?.lineChannelSecret;

                return (
                  <div key={key} className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">{details.name}</h3>
                      {isConfigured ? (
                        <span title="ตั้งค่าแล้ว"><CheckCircle className="text-green-500 w-6 h-6" /></span>
                      ) : (
                        <span title="ยังไม่ตั้งค่า"><XCircle className="text-gray-300 dark:text-gray-600 w-6 h-6" /></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-grow">{details.description}</p>
                    <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => handleOpenModal({ type: 'system', key, name: details.name })}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-white dark:bg-[#323338] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                      >
                        <Key className="w-4 h-4" />
                        ตั้งค่า API Key
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 📌 ส่วนเดิม: ตั้งค่ารายชั้นเรียน */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">ตั้งค่ารายชั้นเรียน (สำหรับครูประจำชั้น)</h2>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู หรือชั้นเรียน..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>

          {/* Teachers Grouped by Grade */}
          {isLoading ? (
            <div className="text-center py-10 text-gray-500">กำลังโหลดข้อมูล...</div>
          ) : filteredTeachers.length === 0 ? (
            <div className="text-center py-10 text-gray-500">ไม่พบข้อมูลครูประจำชั้น</div>
          ) : (
            <div className="space-y-10">
              {/* Grouping logic */}
              {Object.keys(groupedHomeroomTeachers).sort().map(grade => (
                <div key={grade} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-4 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                      ชั้น {grade}
                    </h3>
                    <div className="flex-grow h-px bg-gray-200 dark:bg-gray-700"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedHomeroomTeachers[grade].map((group) => {
                      const isConfigured = hasLineConfig(group.configSource);
                      const teacherNames = group.teachers.map(getTeacherDisplayName);
                      return (
                        <div key={group.key} className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={group.configSource.profileImageUrl || ProfilePlaceholder}
                                alt="Profile"
                                onClick={() => navigate(`/school/${selectedSchoolId}/teachers/view/${group.configSource.id}`)}
                                className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity"
                              />
                              <div
                                onClick={() => navigate(`/school/${selectedSchoolId}/teachers/view/${group.configSource.id}`)}
                                className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                <h3 className="font-bold text-gray-900 dark:text-white">
                                  {group.teachers.length > 1
                                    ? `ครูประจำชั้นร่วม ${group.label}`
                                    : teacherNames[0]}
                                </h3>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {group.teachers.length > 1
                                    ? teacherNames.join(" • ")
                                    : "ครูประจำชั้น"}
                                </p>
                                <div className="flex gap-4 mt-2">
                                  <div className="flex flex-col border-r border-gray-200 dark:border-gray-700 pr-4">
                                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชั้น</span>
                                    <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                                      {group.grade || "-"}
                                    </span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ห้อง</span>
                                    <span className="text-base font-bold text-gray-900 dark:text-white">
                                      {group.room || "-"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {isConfigured ? (
                              <span title="ตั้งค่าแล้ว">
                                <CheckCircle className="text-green-500 w-6 h-6" />
                              </span>
                            ) : (
                              <span title="ยังไม่ตั้งค่า">
                                <XCircle className="text-gray-300 dark:text-gray-600 w-6 h-6" />
                              </span>
                            )}
                          </div>

                          <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">สถานะ LINE OA</span>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${isConfigured
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                                }`}>
                                {isConfigured ? "พร้อมใช้งาน" : "ยังไม่ระบุ"}
                              </span>
                            </div>
                            {group.teachers.length > 1 && (
                              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                                บันทึกครั้งเดียว ระบบจะใช้ร่วมกันสำหรับครูประจำชั้นทั้ง {group.teachers.length} คน
                              </p>
                            )}

                            <button
                              onClick={() => handleOpenModal({ type: 'teacher-group', group })}
                              className="w-full flex items-center justify-center gap-2 py-2 bg-white dark:bg-[#323338] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                            >
                              <Key className="w-4 h-4" />
                              ตั้งค่า API Key
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Configuration Modal */}
        {isModalOpen && selectedTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden animate-fadeIn flex flex-col">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-green-50 dark:bg-green-900/10">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  ตั้งค่า LINE OA {selectedTarget.type === 'teacher-group' ? `(${selectedTarget.group.label})` : `(${selectedTarget.name})`}
                </h3>
                <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto min-h-0">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                  <p className="mb-1">กรุณาระบุข้อมูลจาก LINE Developers Console สำหรับบัญชี LINE OA ของห้องเรียนนี้</p>
                  {selectedTarget.type === 'teacher-group' && selectedTarget.group.teachers.length > 1 && (
                    <p className="mb-1">
                      เมื่อบันทึกแล้ว ระบบจะอัปเดตครูประจำชั้นทุกคนในห้อง {selectedTarget.group.label} พร้อมกัน
                    </p>
                  )}
                  <a
                    href="https://developers.line.biz/console/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    <ExternalLink className="w-3 h-3" /> ไปที่ LINE Developers Console
                  </a>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className={`p-2 rounded-full flex-shrink-0 ${formData.enableNotification ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="enableNotification" className="block text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                      เปิดใช้งานการแจ้งเตือนการลงเวลา
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      เมื่อเปิดใช้งาน ระบบจะส่งข้อความแจ้งเตือนไปยัง LINE OA นี้เมื่อนักเรียนในห้องลงเวลา
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="enableNotification"
                    name="enableNotification"
                    checked={formData.enableNotification}
                    onChange={handleInputChange}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Basic ID (เช่น @123xyz) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lineOABasicId"
                      value={formData.lineOABasicId}
                      onChange={handleInputChange}
                      required
                      placeholder="@xxxxxxx"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Channel ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lineChannelId"
                      value={formData.lineChannelId}
                      onChange={handleInputChange}
                      required
                      placeholder="ระบุ Channel ID (ตัวเลข)"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Channel Access Token <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="lineChannelAccessToken"
                    value={formData.lineChannelAccessToken}
                    onChange={handleInputChange}
                    required
                    placeholder="ระบุ Long-lived access token"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Channel Secret <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="lineChannelSecret"
                      value={formData.lineChannelSecret}
                      onChange={handleInputChange}
                      required
                      placeholder="ระบุ Channel Secret"
                      className="w-full h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      LIFF ID (สำหรับลงทะเบียนผู้ปกครอง/ครู)
                    </label>
                    <input
                      type="text"
                      name="liffId"
                      value={formData.liffId}
                      onChange={handleInputChange}
                      placeholder="ระบุ LIFF ID (เช่น 2000123456-abcdefgh)"
                      className="w-full h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    บันทึกการตั้งค่า
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LineOAManagementPage;
