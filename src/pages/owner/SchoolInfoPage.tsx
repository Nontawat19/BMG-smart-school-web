import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom'; // Import useNavigate and useParams
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { firestore as db, storage } from '../../firebase';
import { doc, getDoc, setDoc, addDoc, collection, query, getDocs, serverTimestamp, where } from 'firebase/firestore'; // Import addDoc, collection, serverTimestamp
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'; // Import deleteObject
import Swal from 'sweetalert2';
import { compressImage } from "@/utils/imageUtils";
import { FaUpload, FaSchool, FaMapMarkerAlt, FaUserTie, FaSave, FaArrowLeft, FaCrosshairs, FaSearch, FaPen, FaEraser, FaUndo, FaWifi, FaChevronRight, FaChevronLeft, FaPlus, FaTrash, FaGlobe, FaShieldAlt, FaLayerGroup, FaCamera, FaUserClock, FaUserCheck, FaBriefcase } from 'react-icons/fa';
import MainLayout from "@/layouts/MainLayout";
import { ROLES } from "@/constants/roles";
import {
  DEFAULT_SCHOOL_SUMMARY,
  getSchoolDashboardSummaryRef,
  updateOwnerDashboardSummary,
  fetchSchoolLicenseInfo,
  saveSchoolLicenseInfo,
  getDaysUntilMaExpiry,
  LICENSE_STATUS_LABELS,
  type SchoolLicenseInfo,
  type LicenseStatus,
} from "@/utils/ownerStatsUtils";

// Import Leaflet components
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CameraConfig {
  id: string;
  name: string;
  sourceType: 'webcam' | 'ipcamera';
  ipCameraUrl?: string;
  mirrorFeed?: boolean;
  enableFaceScan?: boolean; // เปิด/ปิด face scan สำหรับกล้องตัวนี้
  attendanceMethod?: 'rfid' | 'manual_code' | 'both'; // วิธีลงเวลาเมื่อปิด face scan
  pairedUserId?: string; // ไอดีของผู้ใช้ลงเวลาที่จับคู่กับกล้องตัวนี้
  userType?: 'all' | 'teachers' | 'students' | 'specific';
  assignedUserIds?: string[];
}


interface SchoolInfo {
  schoolName?: string;
  schoolCode?: string;
  schoolAbbreviation?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  affiliation?: string;
  directorPrefix?: string;
  directorName?: string;
  academicHeadPrefix?: string;
  academicHeadName?: string;
  budgetHeadPrefix?: string;
  budgetHeadName?: string;
  personnelHeadPrefix?: string;
  personnelHeadName?: string;
  generalHeadPrefix?: string;
  generalHeadName?: string;
  deputyPrefix?: string;
  deputyName?: string;
  deputyAcademicPrefix?: string;
  deputyAcademicName?: string;
  deputyBudgetPrefix?: string;
  deputyBudgetName?: string;
  deputyPersonnelPrefix?: string;
  deputyPersonnelName?: string;
  deputyGeneralPrefix?: string;
  deputyGeneralName?: string;
  studentSupportOfficerPrefix?: string;
  studentSupportOfficerName?: string;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
  checkInRadius?: number;
  boundary?: { lat: number; lng: number }[];
  allowedIpAddresses?: string[];
  schoolType?: string;
  opportunityExpansionLevel?: string;
  useEnrollmentSystem?: boolean;
  useFaceScanMode?: boolean;
  allowTeacherSelfCheckin?: boolean;
  // tri-state: undefined (ยังไม่เคยตั้งค่า) = เปิดใช้งานตามปกติ (โรงเรียนเดิมไม่ถูกกระทบ)
  // true = เปิดใช้งานชัดเจน, false = ปิดระบบลงเวลาทั้งหมด ให้ไปใช้ระบบเช็คแถวแทน
  enableCheckinOutSystem?: boolean;
  faceScanConfig?: {
    endpoint?: string;
    confidenceThreshold?: number;
    token?: string;
    cameras?: CameraConfig[];
  };
  features?: {
    academic?: boolean;
    studentAffairs?: boolean;
    personnel?: boolean;
    budget?: boolean;
    generalAdmin?: boolean;
    director?: boolean;
  };
}

const prefixes = ['นาย', 'นาง', 'นางสาว', 'ดร.', 'ว่าที่ร้อยตรี', 'ผอ.'];

// Helper component to handle map clicks and updates
const MapController: React.FC<{
  center: [number, number];
  zoom: number;
  onMapClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
  onZoomChange: (zoom: number) => void;
}> = ({ center, zoom, onMapClick, onMouseMove, onZoomChange }) => {
  const map = useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    mousemove(e) {
      onMouseMove(e.latlng.lat, e.latlng.lng);
    },
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    map.setView(center, zoom);
  }, [center[0], center[1], zoom, map]);

  return null;
};

const SchoolInfoPage: React.FC = () => {
  const { schoolId } = useParams<{ schoolId?: string }>(); // schoolId is now optional
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user: currentUser, isSchoolAdmin, isSuperAdmin } = usePermissions();

  const [info, setInfo] = useState<SchoolInfo>({});
  const [licenseInfo, setLicenseInfo] = useState<SchoolLicenseInfo>({});
  const [customPrefixModes, setCustomPrefixModes] = useState<Record<string, boolean>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!schoolId); // Only load if editing
  const [isSaving, setIsSaving] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempMousePos, setTempMousePos] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [currentStep, setCurrentStep] = useState(1);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceUsers, setAttendanceUsers] = useState<any[]>([]);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  const collectionName = 'school-settings';

  // Fetch existing school data if schoolId is present (for editing)
  const fetchData = useCallback(async () => {
    if (schoolId) {
      setIsLoading(true);
      try {
        const docRef = doc(db, collectionName, schoolId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as SchoolInfo;
          setInfo(data);
          if (data.logoUrl) {
            setLogoPreview(data.logoUrl);
          }
        } else {
          Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลโรงเรียนที่ต้องการแก้ไข', 'error');
          navigate('/owner/schools');
        }

        // License/MA/สัญญา เก็บแยกจากเอกสารหลัก อ่านได้เฉพาะ SUPER_ADMIN (บังคับด้วย Firestore rules)
        if (isSuperAdmin) {
          const license = await fetchSchoolLicenseInfo(db, schoolId);
          if (license) setLicenseInfo(license);
        }
      } catch (error) {
        console.error("Error fetching school info:", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลโรงเรียนได้', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  }, [schoolId, navigate, isSuperAdmin]);

  useEffect(() => {
    // Security check for school admins
    if (isSchoolAdmin && schoolId && schoolId !== currentUser?.schoolId) {
      Swal.fire('เข้าถึงไม่ได้', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลโรงเรียนอื่น', 'error');
      navigate('/home');
      return;
    }

    if (schoolId) {
      fetchData();
    } else {
      // If it's a new school, reset the form and stop loading
      setInfo({});
      setLogoFile(null);
      setLogoPreview(null);
      setIsLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    const fetchTeachersAndStudents = async () => {
      if (schoolId) {
        try {
          const q = query(collection(db, 'school-settings', schoolId, 'teachers'));
          const querySnapshot = await getDocs(q);
          const teacherList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTeachers(teacherList);
        } catch (error) {
          console.error("Error fetching teachers:", error);
        }
        try {
          const q = query(collection(db, 'school-settings', schoolId, 'students'));
          const querySnapshot = await getDocs(q);
          const studentList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setStudents(studentList);
        } catch (error) {
          console.error("Error fetching students:", error);
        }
        try {
          const q = query(collection(db, 'users'), where('schoolId', '==', schoolId));
          const querySnapshot = await getDocs(q);
          const userList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const filtered = userList.filter((u: any) => {
            const roles = Array.isArray(u.role) ? u.role : [u.role];
            return roles.some((r: string) => 
              r === 'teacher_attendance' || 
              r === 'student_attendance' || 
              r === 'school_attendance'
            );
          });
          setAttendanceUsers(filtered);
        } catch (error) {
          console.error("Error fetching attendance users:", error);
        }
      }
    };
    fetchTeachersAndStudents();
  }, [schoolId]);

  const allSchoolUsers = useMemo(() => {
    const teacherList = teachers.map(t => {
      const fullName = `${t.title || ''}${t.firstName || ''} ${t.lastName || ''}`.trim();
      return {
        id: t.id,
        label: `[ครู] ${fullName}`,
        role: 'teacher' as const,
        searchStr: `${fullName} ครู teacher`.toLowerCase(),
      };
    });

    const studentList = students.map(s => {
      const fullName = `${s.title || ''}${s.firstName || ''} ${s.lastName || ''}`.trim();
      const classRoom = s.classLevel ? ` (${s.classLevel}/${s.room || '1'})` : '';
      return {
        id: s.id,
        label: `[นักเรียน] ${fullName}${classRoom}`,
        role: 'student' as const,
        searchStr: `${fullName} นักเรียน student ${s.classLevel || ''}/${s.room || ''}`.toLowerCase(),
      };
    });

    return [...teacherList, ...studentList];
  }, [teachers, students]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setInfo(prev => ({ ...prev, [name]: checked }));
    } else {
      setInfo(prev => ({ ...prev, [name]: type === 'number' && value !== '' ? parseFloat(value) : value }));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // ตรวจสอบประเภทไฟล์
      if (!file.type.startsWith('image/')) {
        Swal.fire({ icon: 'error', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', background: '#2a2b2f', color: '#ffffff' });
        return;
      }

      try {
        // Compress and convert to PNG (for PDF compatibility)
        const compressedFile = await compressImage(file, 500, 0.8, 'image/png');
        setLogoFile(compressedFile);
        setLogoPreview(URL.createObjectURL(compressedFile));
      } catch (error) {
        console.error("Error compressing image:", error);
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
      }
    } else {
      // Handle case where user cancels file selection
      // Or if you add a "remove" button, you can call this part
      setLogoFile(null);
      setLogoPreview(info.logoUrl || null); // Revert to original logo if available
    }
  };

  const handleMapSearch = async () => {
    if (!mapSearchQuery) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery)}&limit=1&addressdetails=1`, {
        headers: {
          'Accept-Language': 'th'
        }
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        setInfo(prev => ({ ...prev, latitude: newLat, longitude: newLng }));
        setMapZoom(17); // ปรับระดับซูมเป็น 17 (ประมาณ 80% ของสูงสุด)
      } else {
        Swal.fire('ไม่พบสถานที่', 'กรุณาลองค้นหาด้วยชื่ออื่น หรือระบุจังหวัดเพิ่มเติม', 'info');
      }
    } catch (error) {
      console.error("Map search error:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถค้นหาสถานที่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (isDrawing) {
      setInfo(prev => ({
        ...prev,
        boundary: [...(prev.boundary || []), { lat, lng }]
      }));
    } else {
      setInfo(prev => ({ ...prev, latitude: lat, longitude: lng }));
    }
  };

  const handleMouseMove = (lat: number, lng: number) => {
    if (isDrawing) {
      setTempMousePos({ lat, lng });
    }
  };

  const renderPersonnelField = (
    label: string,
    prefixKey: keyof SchoolInfo,
    nameKey: keyof SchoolInfo
  ) => {
    const currentPrefix = (info[prefixKey] as string) || '';
    const currentName = (info[nameKey] as string) || '';
    const isCustom = customPrefixModes[prefixKey as string] || (currentPrefix && !prefixes.includes(currentPrefix));

    const matchedTeacher = teachers.find(t =>
      (t.firstName === currentName || `${t.firstName} ${t.lastName}` === currentName)
    );

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FaUserTie className="text-gray-400" />
              {label}
            </div>
            {matchedTeacher && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 flex items-center gap-1">
                <FaShieldAlt size={10} /> สิทธิ์: {matchedTeacher.role}
              </span>
            )}
          </div>
        </label>
        <div className="flex items-center w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-transparent transition-all">
          {isCustom ? (
            <input
              type="text"
              value={info[prefixKey] as string || ''}
              onChange={(e) => setInfo(prev => ({ ...prev, [prefixKey]: e.target.value }))}
              autoFocus
              onBlur={(e) => {
                if (!e.target.value) {
                  setCustomPrefixModes(prev => ({ ...prev, [prefixKey]: false }));
                }
              }}
              className="shrink-0 w-28 pl-3 pr-2 py-2 bg-transparent border-0 border-r border-gray-200 dark:border-gray-700 focus:ring-0 outline-none text-xs text-gray-900 dark:text-white placeholder-gray-400"
              placeholder="ระบุ..."
            />
          ) : (
            <select
              value={currentPrefix || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'Other') {
                  setCustomPrefixModes(prev => ({ ...prev, [prefixKey]: true }));
                  setInfo(prev => ({ ...prev, [prefixKey]: '' }));
                } else {
                  setCustomPrefixModes(prev => ({ ...prev, [prefixKey]: false }));
                  setInfo(prev => ({ ...prev, [prefixKey]: val }));
                }
              }}
              className={`shrink-0 pl-3 pr-8 py-2 bg-transparent border-0 border-r border-gray-200 dark:border-gray-700 focus:ring-0 outline-none text-xs ${currentPrefix ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}
            >
              <option value="">คำนำหน้า</option>
              {prefixes.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="Other">อื่นๆ</option>
            </select>
          )}
          <input
            type="text"
            name={nameKey}
            value={(info[nameKey] as string) || ''}
            onChange={handleInputChange}
            className="flex-1 px-3 py-2 bg-transparent border-0 focus:ring-0 outline-none text-xs text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="ชื่อ-นามสกุล"
          />
        </div>
        {teachers.length > 0 && (
          <select
            className="mt-2 w-full text-xs text-gray-500 bg-transparent border-none focus:ring-0 cursor-pointer hover:text-indigo-600 transition-colors"
            onChange={(e) => {
              const t = teachers.find(t => t.id === e.target.value);
              if (t) {
                setInfo(prev => ({
                  ...prev,
                  [prefixKey]: t.title,
                  [nameKey]: t.firstName + ' ' + t.lastName
                }));
              }
            }}
            value=""
          >
            <option value="">-- เลือกจากรายชื่อบุคลากรที่มีอยู่ --</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>
                {t.title}{t.firstName} {t.lastName} (สิทธิ์: {t.role})
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  const handleAddCurrentIp = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      const currentIp = data.ip;

      if (currentIp) {
        setInfo(prev => {
          const currentIps = prev.allowedIpAddresses || [];
          if (currentIps.includes(currentIp)) {
            Swal.fire('แจ้งเตือน', `IP Address ${currentIp} มีอยู่ในรายการแล้ว`, 'info');
            return prev;
          }
          return { ...prev, allowedIpAddresses: [...currentIps, currentIp] };
        });
      }
    } catch (error) {
      console.error("Error fetching IP:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึง IP Address ปัจจุบันได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'error');
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire('ไม่รองรับ', 'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setInfo(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
        setMapZoom(17); // ปรับระดับซูมเป็น 17 (ประมาณ 80% ของสูงสุด)
      },
      (error) => {
        Swal.fire('ผิดพลาด', 'ไม่สามารถดึงตำแหน่งได้ กรุณาเปิด GPS', 'error');
      }
    );
  };

  const validateStep = (step: number) => {
    if (step === 1) {
      if (!info.schoolName?.trim()) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกข้อมูล',
          text: 'กรุณาระบุชื่อโรงเรียนก่อนทำรายการต่อ',
          confirmButtonColor: '#f97316'
        });
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;

    // Validate duplicate IP cameras globally
    const cameras = info.faceScanConfig?.cameras || [];
    const ipUrls = cameras
      .filter(c => c.sourceType === 'ipcamera' && c.ipCameraUrl?.trim())
      .map(c => c.ipCameraUrl!.trim());
    
    const hasDuplicateIp = ipUrls.some((url, idx) => ipUrls.indexOf(url) !== idx);
    if (hasDuplicateIp) {
      const seen = new Set<string>();
      let duplicateUrl = '';
      for (const url of ipUrls) {
        if (seen.has(url)) {
          duplicateUrl = url;
          break;
        }
        seen.add(url);
      }
      
      Swal.fire({
        icon: 'error',
        title: 'ไม่สามารถบันทึกข้อมูลได้',
        text: `ตรวจพบกล้องที่ระบุที่อยู่สตรีม IP ซ้ำกัน (${duplicateUrl}) กรุณาแก้ไขไม่ให้กล้องตรงกันครับ`,
        background: '#2a2b2f',
        color: '#ffffff',
        confirmButtonColor: '#f97316'
      });
      return;
    }

    setIsSaving(true);

    try {
      let finalLogoUrl = info.logoUrl || '';
      let currentSchoolId = schoolId;
      const isCreatingSchool = !schoolId;

      if (logoFile) {
        // If adding a new school, we need an ID first.
        if (!currentSchoolId) {
          const tempDocRef = doc(collection(db, collectionName)); // Create a ref with a new ID
          currentSchoolId = tempDocRef.id;
        }
        // 📌 Fix: Add .png extension to the file name
        const result = logoFile.name.substring(logoFile.name.lastIndexOf('.'));
        const fileExtension = result || '.png';

        const logoFileName = `${currentSchoolId}_${Date.now()}${fileExtension}`;
        const logoStorageRef = ref(storage, `school_assets/${logoFileName}`);
        const uploadResult = await uploadBytes(logoStorageRef, logoFile);
        finalLogoUrl = await getDownloadURL(uploadResult.ref);
      } else if (logoPreview === null && info.logoUrl) {
        // Handle logo removal
        try {
          const oldLogoRef = ref(storage, info.logoUrl);
          await deleteObject(oldLogoRef);
        } catch (deleteError) {
          console.warn("Old logo could not be deleted, it might not exist:", deleteError);
        }
        finalLogoUrl = '';
      }

      const dataToSave: SchoolInfo = {
        ...info,
        logoUrl: finalLogoUrl,
        useEnrollmentSystem: info.useEnrollmentSystem === true,
        // เก็บ tri-state ไว้: undefined (ยังไม่เคยตั้งค่า) ต้องไม่ถูกบังคับเป็น false
        // เพราะหน้าลงเวลาใช้ค่า false (ตั้งค่าแล้วปิดจริง) เพื่อบล็อกการลงเวลาทั้งหมด
        // ต่างจาก undefined (โรงเรียนยังไม่เคยใช้ฟีเจอร์นี้ ให้ลงเวลาแบบเดิมได้ปกติ)
        enableCheckinOutSystem: info.enableCheckinOutSystem === false ? false : true,
      };
      const dataToSaveWithSync = { ...dataToSave, updatedAt: serverTimestamp() };

      if (currentSchoolId) {
        // Editing existing school or updating a newly created one
        const docRef = doc(db, collectionName, currentSchoolId);
        await setDoc(docRef, dataToSaveWithSync, { merge: true });
        if (isSuperAdmin) {
          await saveSchoolLicenseInfo(db, currentSchoolId, licenseInfo);
        }
        if (isCreatingSchool) {
          await setDoc(getSchoolDashboardSummaryRef(db, currentSchoolId), {
            ...DEFAULT_SCHOOL_SUMMARY,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          await updateOwnerDashboardSummary(db, { schools: 1 });
        }

        // 📌 Create/Update Slug for the School
        if (dataToSave.schoolCode) {
          const slugId = `school:${dataToSave.schoolCode}`;
          const slugDocRef = doc(db, 'slugs', slugId);
          await setDoc(slugDocRef, {
            slug: slugId,
            targetId: currentSchoolId,
            targetType: 'school',
            schoolId: currentSchoolId,
            fullPath: `/school/${dataToSave.schoolCode}`,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        Swal.fire({
          icon: 'success',
          title: 'บันทึกข้อมูลสำเร็จ',
          text: 'ข้อมูลโรงเรียนได้รับการอัปเดตแล้ว',
          background: '#2a2b2f',
          color: '#ffffff',
          }).then(() => {
            // 📌 Update Redux Store
            if (currentSchoolId) {
              dispatch(fetchSchoolSettings(currentSchoolId) as any);
            }
            if (isSchoolAdmin) {
              navigate('/owner/hub'); // Or wherever school admins should go
            } else {
              navigate(`/owner/schools/${currentSchoolId}`);
            }
          });
      } else {
        // 📌 Create the new school first to get the ID
        const newDocRef = await addDoc(collection(db, collectionName), dataToSaveWithSync);
        const newId = newDocRef.id;
        await setDoc(getSchoolDashboardSummaryRef(db, newId), {
          ...DEFAULT_SCHOOL_SUMMARY,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await updateOwnerDashboardSummary(db, { schools: 1 });
        if (isSuperAdmin) {
          await saveSchoolLicenseInfo(db, newId, licenseInfo);
        }

        // 📌 Create Slug for the School
        if (dataToSave.schoolCode) {
          const slugId = `school:${dataToSave.schoolCode}`;
          const slugDocRef = doc(db, 'slugs', slugId);
          await setDoc(slugDocRef, {
            slug: slugId,
            targetId: newId,
            targetType: 'school',
            schoolId: newId,
            fullPath: `/school/${dataToSave.schoolCode}`,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        Swal.fire({
          icon: 'success',
          title: 'เพิ่มข้อมูลสำเร็จ',
          text: 'ข้อมูลโรงเรียนใหม่ได้รับการบันทึกแล้ว',
          background: '#2a2b2f',
          color: '#ffffff',
          }).then(() => {
            if (isSchoolAdmin) {
              navigate('/owner/hub');
            } else {
              navigate(`/owner/schools/${newId}`);
            }
          });
      }

    } catch (error) {
      console.error("Error saving school info:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลโรงเรียนได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="h-12 w-full rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={`skeleton-${i}`} className="h-14 w-full rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  const steps = [
    { id: 1, title: 'ข้อมูลทั่วไป', icon: <FaSchool /> },
    { id: 2, title: 'ที่ตั้งโรงเรียน', icon: <FaMapMarkerAlt /> },
    { id: 3, title: 'ตั้งค่าจุดเช็คอิน', icon: <FaCrosshairs /> },
    { id: 4, title: 'บุคลากรหลัก', icon: <FaUserTie /> },
    { id: 5, title: 'ตั้งค่าระบบงาน', icon: <FaLayerGroup /> },
    ...(isSuperAdmin ? [{ id: 6, title: 'License / สัญญา', icon: <FaShieldAlt /> }] : []),
  ];

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 font-sans">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-6 py-4">

          {/* Header */}
          <div className="sticky top-[60px] z-[100] bg-gray-50/80 dark:bg-[#1e1f21]/80 backdrop-blur-md py-2.5 mb-3 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 border-b border-gray-200 dark:border-gray-800 transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <Link to="/owner/schools" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">โรงเรียนทั้งหมด</Link>
                  <span>/</span>
                  <span className="text-gray-900 dark:text-white font-medium">{schoolId ? 'แก้ไขข้อมูล' : 'เพิ่มโรงเรียน'}</span>
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {schoolId ? 'แก้ไขข้อมูลโรงเรียน' : 'เพิ่มโรงเรียนใหม่'}
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to={isSchoolAdmin ? '/owner/hub' : '/owner/schools'}
                  className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-[#2a2b2f] dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 transition-all shadow-sm"
                >
                  <FaArrowLeft className="text-[10px]" />
                  <span className="hidden sm:inline">ย้อนกลับ</span>
                </Link>

                <button
                  type="submit"
                  form="school-info-form"
                  disabled={isSaving}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <FaSave />
                      <span>บันทึกข้อมูลทั้งหมด</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <form id="school-info-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left Column: Logo Upload */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <FaSchool className="text-indigo-500" />
                  ตราสัญลักษณ์
                </h3>

                <div className="flex flex-col items-center">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full bg-gray-50 dark:bg-[#1e1f21] border-4 border-white dark:border-gray-700 shadow-lg flex items-center justify-center overflow-hidden relative">
                      {logoPreview ? (
                        <img src={logoPreview} alt="School Logo" className="w-full h-full object-cover" />
                      ) : (
                        <FaSchool className="text-4xl text-gray-300 dark:text-gray-600" />
                      )}

                      {/* Overlay on hover */}
                      <label
                        htmlFor="logo-upload"
                        className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <FaUpload className="text-white text-2xl mb-2" />
                        <span className="text-white text-xs font-medium">อัปโหลดรูปภาพ</span>
                      </label>
                    </div>

                    {/* Edit button badge */}
                    <label
                      htmlFor="logo-upload"
                      className="absolute bottom-1 right-1 bg-indigo-600 text-white p-2.5 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-transform hover:scale-110 active:scale-95"
                    >
                      <FaUpload size={12} />
                    </label>
                  </div>
                  <input id="logo-upload" type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleFileChange} />

                  <div className="mt-4 text-center">
                    <p className="text-xs font-medium text-gray-900 dark:text-white">รูปภาพตราโรงเรียน</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      รองรับไฟล์ PNG, JPG <br />ขนาดที่แนะนำ 500x500 พิกเซล
                    </p>
                  </div>
                </div>

                <div className="hidden lg:block mt-3 bg-white dark:bg-[#2a2b2f] rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-gray-800">
                  <nav className="space-y-1">
                    {steps.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => validateStep(currentStep) && setCurrentStep(step.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium rounded-xl transition-all ${currentStep === step.id
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                      >
                        <div className={`p-1 rounded-lg transition-colors ${currentStep === step.id ? 'bg-white dark:bg-[#1e1f21] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                          {React.cloneElement(step.icon as React.ReactElement<any>, { size: 10 })}
                        </div>
                        <span className="flex-1 text-left">{step.title}</span>
                        {currentStep === step.id && <FaChevronRight className="text-[9px] text-indigo-400" />}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </div>

            {/* Right Column: Form Fields */}
            <div className="lg:col-span-8 space-y-6">

              {/* Step 1: General Info */}
              {currentStep === 1 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-5 bg-indigo-500 rounded-full mr-1"></span>
                    ข้อมูลทั่วไป
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ชื่อโรงเรียน <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="schoolName"
                        value={info.schoolName || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        placeholder="ระบุชื่อโรงเรียน"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        รหัสสถานศึกษา
                      </label>
                      <input
                        type="text"
                        name="schoolCode"
                        value={info.schoolCode || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        placeholder="เช่น 10xxxxxxxx"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          ชื่อย่อโรงเรียน
                        </label>
                        <input
                          type="text"
                          name="schoolAbbreviation"
                          value={info.schoolAbbreviation || ''}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                          placeholder="เช่น ร.ร.บ้านแก้งปิง, บ.ก.ป."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          สังกัด
                        </label>
                        <input
                          type="text"
                          name="affiliation"
                          value={info.affiliation || ''}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                          placeholder="เช่น สพป. กาฬสินธุ์ เขต 2"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          ประเภทโรงเรียน
                        </label>
                        <select
                          name="schoolType"
                          value={info.schoolType || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            let level = '';
                            if (val === 'ประถม') level = 'อ.1-ป.6'; // Defaulting to include Kindergarten as per new requirement, or leave empty? User prefers 'อ.1-ป.6' coverage mainly.
                            else if (val === 'มัธยมศึกษา') level = 'ม.1-ม.6';
                            else if (val === 'ขยายโอกาส') level = 'อ.1-ม.3'; // Default for expansion? Or let them choose. Let's start with empty or smart default.


                            setInfo(prev => ({
                              ...prev,
                              schoolType: val,
                              opportunityExpansionLevel: level
                            }));
                          }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        >
                          <option value="">-- เลือกประเภท --</option>
                          <option value="ประถม">ประถมศึกษา</option>
                          <option value="มัธยมศึกษา">มัธยมศึกษา</option>
                          <option value="ขยายโอกาส">ขยายโอกาส</option>
                        </select>
                      </div>
                      {info.schoolType && (
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ระดับชั้นที่เปิดสอน
                          </label>
                          <select
                            name="opportunityExpansionLevel"
                            value={info.opportunityExpansionLevel || ''}
                            onChange={handleInputChange}
                            disabled={!info.schoolType}
                            className={`w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400`}
                          >
                            <option value="">-- เลือกระดับชั้น --</option>
                            {info.schoolType === 'ประถม' && (
                              <>
                                <option value="ป.1-ป.6">ป.1-ป.6</option>
                                <option value="อ.1-ป.6">อ.1-ป.6 (อนุบาล - ป.6)</option>
                              </>
                            )}
                            {info.schoolType === 'มัธยมศึกษา' && (
                              <option value="ม.1-ม.6">ม.1-ม.6</option>
                            )}
                            {info.schoolType === 'ขยายโอกาส' && (
                              <>
                                <option value="ป.1-ม.3">ป.1-ม.3</option>
                                <option value="ป.1-ม.6">ป.1-ม.6</option>
                                <option value="อ.1-ม.3">อ.1-ม.3 (อนุบาล - ม.3)</option>
                                <option value="อ.1-ม.6">อ.1-ม.6 (อนุบาล - ม.6)</option>
                              </>
                            )}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700 md:col-span-2">
                      <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-teal-50 dark:bg-teal-500/10 rounded-2xl border border-teal-100 dark:border-teal-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white dark:bg-[#1e1f21] rounded-xl text-teal-600 shadow-sm">
                            <FaUserClock size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">อนุญาตให้ครูลงเวลาเอง</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">เปิดให้ครู (role ครู) ลงเวลาเข้า-ออกงานด้วยตนเองผ่านอุปกรณ์ของตัวเองได้ที่หน้า "งานบุคลากร" ระบบจะตรวจสอบตำแหน่ง/เครือข่ายเช่นเดียวกับจุดคีออสก์</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            name="allowTeacherSelfCheckin"
                            checked={info.allowTeacherSelfCheckin || false}
                            onChange={handleInputChange}
                            className="sr-only peer"
                          />
                          <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-teal-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-500/10 rounded-2xl border border-rose-100 dark:border-rose-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white dark:bg-[#1e1f21] rounded-xl text-rose-600 shadow-sm">
                            <FaUserCheck size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">เปิดใช้งานระบบลงเวลา (สแกน/บัตร/พิมพ์รหัส)</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">ปิดสวิตช์นี้สำหรับโรงเรียนที่ไม่ใช้ระบบสแกนหน้า/บัตร/พิมพ์รหัส — จะบล็อกหน้า "ลงเวลาเข้า-ออก" ทั้งหมด (รวมลงเวลาด้วยตนเอง) แล้วให้เช็คชื่อผ่านระบบ "เช็คแถว" (flag-ceremony) แทน</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            name="enableCheckinOutSystem"
                            checked={info.enableCheckinOutSystem !== false}
                            onChange={handleInputChange}
                            className="sr-only peer"
                          />
                          <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-rose-600"></div>
                        </label>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white dark:bg-[#1e1f21] rounded-xl text-indigo-600 shadow-sm">
                              <FaCamera size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">เปิดโหมดการลงเวลา</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">เปิดใช้งานระบบกล้องสำหรับลงเวลา (รองรับ Face Recognition/Webhook) ส่วนแต่ละกล้องจะใช้สแกนใบหน้าหรือไม่ ตั้งค่าได้ที่รายการอุปกรณ์กล้องด้านล่าง</p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              name="useFaceScanMode"
                              checked={info.useFaceScanMode || false}
                              onChange={handleInputChange}
                              className="sr-only peer"
                            />
                            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>
                      )}
                      {isSuperAdmin && (
                        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-100 dark:border-amber-500/20">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white dark:bg-[#1e1f21] rounded-xl text-amber-600 shadow-sm">
                              <FaBriefcase size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">เปิดใช้งานระบบงานธุรการ (Owner เท่านั้น)</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">เปิด/ปิดโมดูลงานธุรการทั้งหมดของโรงเรียนนี้ — ลงรับ/ส่งหนังสือ, คำสั่ง, ประกาศ, ทะเบียนหนังสือ, มอบหมายงาน ผอ. ปิดสวิตช์นี้จะซ่อนเมนู "งานธุรการ" และบล็อกทุกหน้าของโมดูลนี้ทันที</p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={info.features?.generalAdmin ?? true}
                              onChange={(e) => {
                                setInfo(prev => ({
                                  ...prev,
                                  features: {
                                    ...prev.features,
                                    generalAdmin: e.target.checked,
                                  },
                                }));
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600"></div>
                          </label>
                        </div>
                      )}
                      {info.useFaceScanMode && (
                        <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-white/70 p-4 dark:border-indigo-500/20 dark:bg-[#1e1f21]/70">
                          {isSuperAdmin && (
                            <>
                              <div>
                                <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                  Endpoint สำหรับส่งภาพไป Face Recognition/Proxy
                                </label>
                                <input
                                  type="text"
                                  value={info.faceScanConfig?.endpoint || ''}
                                  onChange={(e) => setInfo(prev => ({
                                    ...prev,
                                    faceScanConfig: {
                                      ...(prev.faceScanConfig || {}),
                                      endpoint: e.target.value,
                                    },
                                  }))}
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                                  placeholder="เช่น https://your-server.local/api/face/identify"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Token (Authorization)
                                  </label>
                                  <input
                                    type="text"
                                    value={info.faceScanConfig?.token || ''}
                                    onChange={(e) => setInfo(prev => ({
                                      ...prev,
                                      faceScanConfig: {
                                        ...(prev.faceScanConfig || {}),
                                        token: e.target.value,
                                      },
                                    }))}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                                    placeholder="เช่น Token abc123xyz..."
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    ความมั่นใจขั้นต่ำ
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={info.faceScanConfig?.confidenceThreshold ?? 0.85}
                                    onChange={(e) => setInfo(prev => ({
                                      ...prev,
                                      faceScanConfig: {
                                        ...(prev.faceScanConfig || {}),
                                        confidenceThreshold: Number(e.target.value),
                                      },
                                    }))}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white"
                                    placeholder="0.85"
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          {/* 📷 School Camera Manager UI */}
                          <div className={isSuperAdmin ? "mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-500/20" : "pt-2"}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                <FaCamera />
                                อุปกรณ์กล้องสำหรับลงเวลาของโรงเรียน ({info.faceScanConfig?.cameras?.length || 0} ตัว)
                              </h4>
                              <button
                                type="button"
                                onClick={() => {
                                  const newCam: CameraConfig = {
                                    id: Date.now().toString(),
                                    name: `กล้องสแกนหน้า ${((info.faceScanConfig?.cameras || []).length + 1)}`,
                                    sourceType: 'ipcamera',
                                    ipCameraUrl: '',
                                    mirrorFeed: false,
                                    enableFaceScan: true,
                                    userType: 'all',
                                    assignedUserIds: []
                                  };
                                  setInfo(prev => ({
                                    ...prev,
                                    faceScanConfig: {
                                      ...(prev.faceScanConfig || {}),
                                      cameras: [...(prev.faceScanConfig?.cameras || []), newCam]
                                    }
                                  }));
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 transition-all shadow-sm shadow-indigo-200 dark:shadow-none hover:scale-105 active:scale-95"
                              >
                                <FaPlus size={10} />
                                เพิ่มกล้องใหม่
                              </button>
                            </div>

                            {(!info.faceScanConfig?.cameras || info.faceScanConfig.cameras.length === 0) ? (
                              <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                                <FaCamera size={24} className="mx-auto text-gray-300 dark:text-gray-700 mb-2" />
                                ยังไม่มีการเพิ่มกล้องสำหรับโรงเรียนนี้ กรุณากด "เพิ่มกล้องใหม่" เพื่อกำหนดค่ากล้อง IP หรือเว็บแคม
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {info.faceScanConfig.cameras.map((cam, idx) => {
                                  const faceScanOn = cam.enableFaceScan ?? true;
                                  return (
                                  <div key={cam.id} className={`p-3 rounded-xl border transition-all flex flex-col gap-3 relative group ${
                                    faceScanOn
                                      ? 'border-indigo-300 dark:border-indigo-700/60 bg-indigo-50/30 dark:bg-indigo-900/10'
                                      : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-900/50 opacity-70'
                                  }`}>

                                    {/* Top bar: Camera Index | Face Scan Toggle | Delete */}
                                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-800 pb-2">
                                      <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${faceScanOn ? 'text-indigo-500' : 'text-gray-400'}`}>
                                        <FaCamera size={10} />
                                        อุปกรณ์ที่ #{idx + 1} - {cam.name || 'ไม่มีชื่อ'}
                                      </span>

                                      <div className="flex items-center gap-2">
                                        {/* Face scan toggle per camera */}
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none" title="เปิด/ปิด Face Scan สำหรับกล้องนี้">
                                          <span className={`text-[10px] font-bold ${faceScanOn ? 'text-indigo-500' : 'text-gray-400'}`}>
                                            {faceScanOn ? 'สแกนหน้า: เปิด' : 'สแกนหน้า: ปิด'}
                                          </span>
                                          <div className="relative inline-flex items-center">
                                            <input
                                              type="checkbox"
                                              checked={faceScanOn}
                                              onChange={(e) => {
                                                const val = e.target.checked;
                                                setInfo(prev => {
                                                  const current = prev.faceScanConfig?.cameras || [];
                                                  const updated = current.map(c => c.id === cam.id ? { ...c, enableFaceScan: val } : c);
                                                  return { ...prev, faceScanConfig: { ...(prev.faceScanConfig || {}), cameras: updated } };
                                                });
                                              }}
                                              className="sr-only peer"
                                            />
                                            <div className="w-8 h-4 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                                          </div>
                                        </label>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            Swal.fire({
                                              title: 'ยืนยันการลบกล้อง?',
                                              text: `คุณต้องการลบกล้อง "${cam.name}" หรือไม่?`,
                                              icon: 'warning',
                                              showCancelButton: true,
                                              confirmButtonText: 'ลบออก',
                                              cancelButtonText: 'ยกเลิก',
                                              confirmButtonColor: '#d33',
                                              background: '#2a2b2f',
                                              color: '#ffffff',
                                            }).then((result) => {
                                              if (result.isConfirmed) {
                                                setInfo(prev => {
                                                  const currentCameras = prev.faceScanConfig?.cameras || [];
                                                  const updated = currentCameras.filter(c => c.id !== cam.id);
                                                  return {
                                                    ...prev,
                                                    faceScanConfig: {
                                                      ...(prev.faceScanConfig || {}),
                                                      cameras: updated
                                                    }
                                                  };
                                                });
                                              }
                                            });
                                          }}
                                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50/10 transition-colors"
                                          title="ลบกล้องนี้"
                                        >
                                          <FaTrash size={12} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Input fields in responsive 3-column layout */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">ชื่อกล้อง / จุดติดตั้ง</label>
                                        <input
                                          type="text"
                                          value={cam.name}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setInfo(prev => {
                                              const current = prev.faceScanConfig?.cameras || [];
                                              const updated = current.map(c => c.id === cam.id ? { ...c, name: val } : c);
                                              return {
                                                ...prev,
                                                faceScanConfig: {
                                                  ...(prev.faceScanConfig || {}),
                                                  cameras: updated
                                                }
                                              };
                                            });
                                          }}
                                          placeholder="เช่น ประตูสแกนหลัก, อาคาร 1"
                                          className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none text-xs text-gray-900 dark:text-white"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">ประเภทกล้อง (Video Source)</label>
                                        <select
                                          value={cam.sourceType}
                                          onChange={(e) => {
                                            const val = e.target.value as 'webcam' | 'ipcamera';
                                            setInfo(prev => {
                                              const current = prev.faceScanConfig?.cameras || [];
                                              const updated = current.map(c => c.id === cam.id ? { 
                                                ...c, 
                                                sourceType: val,
                                                mirrorFeed: val === 'webcam'
                                              } : c);
                                              return {
                                                ...prev,
                                                faceScanConfig: {
                                                  ...(prev.faceScanConfig || {}),
                                                  cameras: updated
                                                }
                                              };
                                            });
                                          }}
                                          className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none text-xs text-gray-900 dark:text-white cursor-pointer"
                                        >
                                          <option value="webcam">กล้อง Webcam / USB</option>
                                          <option value="ipcamera">กล้อง IP Camera (HTTP Snapshot / RTSP)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">ผู้ใช้สิทธิ์ลงเวลาที่จับคู่ (Paired Kiosk User)</label>
                                        <select
                                          value={cam.pairedUserId || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setInfo(prev => {
                                              const current = prev.faceScanConfig?.cameras || [];
                                              const updated = current.map(c => c.id === cam.id ? { 
                                                ...c, 
                                                pairedUserId: val
                                              } : c);
                                              return {
                                                ...prev,
                                                faceScanConfig: {
                                                  ...(prev.faceScanConfig || {}),
                                                  cameras: updated
                                                }
                                              };
                                            });
                                          }}
                                          className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none text-xs text-gray-900 dark:text-white cursor-pointer"
                                        >
                                          <option value="">-- ไม่เลือก (ใช้สำหรับสแกนหน้าทั่วไป) --</option>
                                          {attendanceUsers
                                            .filter(user => {
                                              const isPairedToOther = (info.faceScanConfig?.cameras || []).some(
                                                c => c.id !== cam.id && c.pairedUserId === user.id
                                              );
                                              return !isPairedToOther;
                                            })
                                            .map(user => {
                                              const roleNames = (Array.isArray(user.role) ? user.role : [user.role])
                                                .map((r: string) => {
                                                  if (r === 'teacher_attendance') return 'ลงเวลาครู';
                                                  if (r === 'student_attendance') return 'ลงเวลานักเรียน';
                                                  if (r === 'school_attendance') return 'ลงเวลาทั้งหมด';
                                                  return r;
                                                })
                                                .join(', ');
                                              return (
                                                <option key={user.id} value={user.id}>
                                                  {user.fullName} ({roleNames})
                                                </option>
                                              );
                                            })}
                                        </select>
                                      </div>
                                    </div>

                                    {faceScanOn ? (
                                      <>
                                        {/* IP Camera stream address (only if sourceType is ipcamera) */}
                                        {cam.sourceType === 'ipcamera' && (
                                          <div className="mt-2.5">
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">ที่อยู่สตรีมกล้อง IP (HTTP Snapshot หรือ RTSP URL)</label>
                                            <input
                                              type="text"
                                              value={cam.ipCameraUrl || ''}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setInfo(prev => {
                                                  const current = prev.faceScanConfig?.cameras || [];
                                                  const updated = current.map(c => c.id === cam.id ? { ...c, ipCameraUrl: val } : c);
                                                  return { ...prev, faceScanConfig: { ...(prev.faceScanConfig || {}), cameras: updated } };
                                                });
                                              }}
                                              onBlur={(e) => {
                                                const val = e.target.value.trim();
                                                if (val !== '') {
                                                  const duplicate = (info.faceScanConfig?.cameras || []).find(
                                                    c => c.id !== cam.id && c.sourceType === 'ipcamera' && c.ipCameraUrl?.trim() === val
                                                  );
                                                  if (duplicate) {
                                                    Swal.fire({
                                                      icon: 'warning',
                                                      title: 'ที่อยู่กล้องซ้ำกัน',
                                                      text: `ที่อยู่สตรีม IP Camera นี้ตรงกับกล้อง "${duplicate.name}" กรุณาใช้กล้องตัวอื่นเพื่อไม่ให้ระบบสตรีมชนกันครับ`,
                                                      background: '#2a2b2f',
                                                      color: '#ffffff',
                                                      confirmButtonColor: '#f97316'
                                                    });
                                                  }
                                                }
                                              }}
                                              placeholder="เช่น rtsp://user:pass@192.168.1.64:554/stream1 หรือ http://admin:password@192.168.1.64/.../picture"
                                              className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none text-xs text-gray-900 dark:text-white font-mono"
                                            />
                                          </div>
                                        )}
                                        {/* Mirror Feed */}
                                        <div className="flex items-center gap-2 px-1">
                                          <input
                                            type="checkbox"
                                            id={`mirror-${cam.id}`}
                                            checked={cam.mirrorFeed ?? false}
                                            onChange={(e) => {
                                              const val = e.target.checked;
                                              setInfo(prev => {
                                                const current = prev.faceScanConfig?.cameras || [];
                                                const updated = current.map(c => c.id === cam.id ? { ...c, mirrorFeed: val } : c);
                                                return { ...prev, faceScanConfig: { ...(prev.faceScanConfig || {}), cameras: updated } };
                                              });
                                            }}
                                            className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-indigo-500 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                          />
                                          <label htmlFor={`mirror-${cam.id}`} className="text-[10px] font-bold text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                                            กลับด้านภาพ (Mirror Video)
                                          </label>
                                        </div>
                                      </>
                                    ) : (
                                      /* วิธีลงเวลาเมื่อปิด face scan */
                                      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1e1f21] p-3">
                                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2">วิธีลงเวลาที่จุดนี้ (แทนการสแกนหน้า)</p>
                                        <div className="grid grid-cols-3 gap-2">
                                          {([
                                            { value: 'rfid', label: 'RFID / บัตร', icon: '💳', desc: 'แตะบัตรลงเวลา' },
                                            { value: 'manual_code', label: 'กรอกรหัส', icon: '⌨️', desc: 'รหัสครู/นักเรียน' },
                                            { value: 'both', label: 'ทั้งสองแบบ', icon: '🔀', desc: 'RFID + กรอกรหัส' },
                                          ] as const).map(opt => {
                                            const selected = (cam.attendanceMethod ?? 'manual_code') === opt.value;
                                            return (
                                              <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setInfo(prev => {
                                                  const current = prev.faceScanConfig?.cameras || [];
                                                  const updated = current.map(c => c.id === cam.id ? { ...c, attendanceMethod: opt.value } : c);
                                                  return { ...prev, faceScanConfig: { ...(prev.faceScanConfig || {}), cameras: updated } };
                                                })}
                                                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${
                                                  selected
                                                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700'
                                                }`}
                                              >
                                                <span className="text-base">{opt.icon}</span>
                                                <span className={`text-[10px] font-bold ${selected ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>{opt.label}</span>
                                                <span className="text-[9px] text-gray-400">{opt.desc}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Location */}
              {currentStep === 2 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-6 bg-emerald-500 rounded-full mr-1"></span>
                    ที่ตั้งโรงเรียน
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">ตำบล</label>
                      <input
                        type="text"
                        name="subDistrict"
                        value={info.subDistrict || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">อำเภอ</label>
                      <input
                        type="text"
                        name="district"
                        value={info.district || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">จังหวัด</label>
                      <input
                        type="text"
                        name="province"
                        value={info.province || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">รหัสไปรษณีย์</label>
                      <input
                        type="text"
                        name="postalCode"
                        value={info.postalCode || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Geofencing */}
              {currentStep === 3 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-500 rounded-full mr-1"></span>
                    ตั้งค่าจุดเช็คอิน (Geofencing)
                  </h3>

                  {/* Map Search */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={mapSearchQuery}
                      onChange={(e) => setMapSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleMapSearch())}
                      placeholder="ค้นหาสถานที่ในแผนที่ (เช่น ชื่อโรงเรียน, สถานที่สำคัญ)..."
                      className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={handleMapSearch}
                      disabled={isSearching}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSearching ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <FaSearch />
                      )}
                      <span className="hidden sm:inline">{isSearching ? 'กำลังค้นหา...' : 'ค้นหา'}</span>
                    </button>
                  </div>

                  {/* Drawing Tools */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDrawing(!isDrawing);
                        setTempMousePos(null);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${isDrawing
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-300'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-[#1e1f21] dark:text-gray-300 dark:border-gray-700'
                        }`}
                    >
                      <FaPen />
                      {isDrawing ? 'กำลังวาด... (คลิกที่แผนที่)' : 'วาดขอบเขตพื้นที่'}
                    </button>

                    {info.boundary && info.boundary.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setInfo(prev => ({ ...prev, boundary: prev.boundary?.slice(0, -1) }))}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 dark:bg-[#1e1f21] dark:text-gray-400 dark:border-gray-700"
                        >
                          <FaUndo /> ย้อนกลับ
                        </button>
                        <button
                          type="button"
                          onClick={() => setInfo(prev => ({ ...prev, boundary: [] }))}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30"
                        >
                          <FaEraser /> ล้างเส้น
                        </button>
                      </>
                    )}
                  </div>

                  {/* Map Display */}
                  <div className={`mb-6 h-[320px] w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 relative z-0 ${isDrawing ? '[&_.leaflet-grab]:cursor-crosshair' : ''}`}>
                    <MapContainer
                      center={[info.latitude || 13.7563, info.longitude || 100.5018]}
                      zoom={mapZoom}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={20}
                      />
                      <MapController
                        center={[info.latitude || 13.7563, info.longitude || 100.5018]}
                        zoom={mapZoom}
                        onMapClick={handleMapClick}
                        onMouseMove={handleMouseMove}
                        onZoomChange={setMapZoom}
                      />
                      {info.latitude && info.longitude && (
                        <Marker position={[info.latitude, info.longitude]} />
                      )}
                      {info.boundary && info.boundary.length > 0 && (
                        <>
                          <Polygon
                            positions={
                              isDrawing && tempMousePos
                                ? [...info.boundary.map(p => [p.lat, p.lng]), [tempMousePos.lat, tempMousePos.lng]] as [number, number][]
                                : info.boundary.map(p => [p.lat, p.lng]) as [number, number][]
                            }
                            color="#f97316"
                            fillColor="#f97316"
                            fillOpacity={0.3}
                          />
                          {isDrawing && info.boundary.length > 2 && (
                            <CircleMarker
                              center={[info.boundary[0].lat, info.boundary[0].lng]}
                              radius={6}
                              pathOptions={{ color: 'white', fillColor: '#f97316', fillOpacity: 1, weight: 2 }}
                              eventHandlers={{
                                click: (e) => {
                                  L.DomEvent.stopPropagation(e.originalEvent);
                                  setIsDrawing(false);
                                  setTempMousePos(null);
                                },
                                mouseover: (e) => e.target.openPopup(),
                                mouseout: (e) => e.target.closePopup(),
                              }}
                            >
                              <Popup>คลิกเพื่อจบการวาด</Popup>
                            </CircleMarker>
                          )}
                        </>
                      )}
                    </MapContainer>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="sm:col-span-3">
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                      >
                        <FaCrosshairs />
                        ดึงพิกัดปัจจุบันของฉัน
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        * กดปุ่มนี้เพื่อระบุจุดกึ่งกลาง หรือใช้เครื่องมือ "วาดขอบเขตพื้นที่" เพื่อกำหนดกรอบพื้นที่เช็คอินให้แม่นยำยิ่งขึ้น
                      </p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">ละติจูด (Latitude)</label>
                      <input
                        type="number"
                        step="any"
                        name="latitude"
                        value={info.latitude || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        placeholder="เช่น 13.7563"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">ลองจิจูด (Longitude)</label>
                      <input
                        type="number"
                        step="any"
                        name="longitude"
                        value={info.longitude || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        placeholder="เช่น 100.5018"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">รัศมี (เมตร)</label>
                      <input
                        type="number"
                        name="checkInRadius"
                        value={info.checkInRadius || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white placeholder-gray-400"
                        placeholder="แนะนำ 50-100"
                      />
                    </div>

                    <div className="sm:col-span-3 border-t border-gray-100 dark:border-gray-700 pt-4 mt-2">
                      <div className="flex items-center gap-2 mb-3">
                        <FaWifi className="text-blue-500" />
                        <span className="text-sm font-bold text-gray-900 dark:text-white">การยืนยันตัวตนสำรอง (เมื่อ GPS ไม่เสถียร)</span>

                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">IP Address ของเครือข่ายโรงเรียน (Public IP)</label>

                          {(info.allowedIpAddresses && info.allowedIpAddresses.length > 0) ? (
                            info.allowedIpAddresses.map((ip, index) => (
                              <div key={index} className="flex gap-2 mb-2">
                                <input
                                  type="text"
                                  value={ip}
                                  onChange={(e) => {
                                    const newIps = [...(info.allowedIpAddresses || [])];
                                    newIps[index] = e.target.value;
                                    setInfo(prev => ({ ...prev, allowedIpAddresses: newIps }));
                                  }}
                                  className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400"
                                  placeholder="เช่น 203.146.xxx.xxx"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newIps = [...(info.allowedIpAddresses || [])];
                                    newIps.splice(index, 1);
                                    setInfo(prev => ({ ...prev, allowedIpAddresses: newIps }));
                                  }}
                                  className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                  title="ลบ IP นี้"
                                >
                                  <FaTrash />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-gray-500 italic mb-2">ยังไม่มีการระบุ IP Address</div>
                          )}

                          <div className="flex flex-wrap gap-3 mt-2">
                            <button
                              type="button"
                              onClick={() => setInfo(prev => ({ ...prev, allowedIpAddresses: [...(prev.allowedIpAddresses || []), ''] }))}
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border border-blue-200 dark:border-blue-800"
                            >
                              <FaPlus /> เพิ่มช่องกรอกเอง
                            </button>
                            <button
                              type="button"
                              onClick={handleAddCurrentIp}
                              className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border border-emerald-200 dark:border-emerald-800"
                            >
                              <FaGlobe /> ดึง IP ปัจจุบันของเครื่องนี้
                            </button>
                          </div>

                          <p className="text-xs text-gray-500 mt-2">
                            * หากระบุค่านี้ ระบบจะอนุญาตให้เช็คอินได้ทันทีหากผู้ใช้งานเชื่อมต่อผ่าน WiFi ของโรงเรียน (IP ตรงกัน) โดยไม่ต้องคำนึงถึงพิกัด GPS
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Step 4: Personnel */}
              {currentStep === 4 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-6 bg-orange-500 rounded-full mr-1"></span>
                    บุคลากรหลัก
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderPersonnelField('ผู้อำนวยการ', 'directorPrefix', 'directorName')}
                    {renderPersonnelField('รองผู้อำนวยการ', 'deputyPrefix', 'deputyName')}
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      สำหรับโรงเรียนขนาดใหญ่ที่มีรองผู้อำนวยการประจำ 4 กลุ่มบริหารงาน ให้กรอกช่อง "รองผู้อำนวยการกลุ่ม..." ส่วนโรงเรียนที่ไม่มีตำแหน่งรองผู้อำนวยการระดับกลุ่มงาน ให้กรอกเฉพาะช่อง "หัวหน้าฝ่าย..." แทน (กรอกเพียงช่องใดช่องหนึ่งต่อกลุ่มงานก็ได้)
                    </p>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderPersonnelField('รองผู้อำนวยการกลุ่มบริหารงานวิชาการ', 'deputyAcademicPrefix', 'deputyAcademicName')}
                        {renderPersonnelField('หัวหน้าฝ่ายวิชาการ', 'academicHeadPrefix', 'academicHeadName')}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderPersonnelField('รองผู้อำนวยการกลุ่มบริหารงานงบประมาณ', 'deputyBudgetPrefix', 'deputyBudgetName')}
                        {renderPersonnelField('หัวหน้าฝ่ายบริหารงานงบประมาณ', 'budgetHeadPrefix', 'budgetHeadName')}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderPersonnelField('รองผู้อำนวยการกลุ่มบริหารงานบุคคล', 'deputyPersonnelPrefix', 'deputyPersonnelName')}
                        {renderPersonnelField('หัวหน้าฝ่ายบริหารงานบุคคล', 'personnelHeadPrefix', 'personnelHeadName')}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderPersonnelField('รองผู้อำนวยการกลุ่มบริหารงานทั่วไป', 'deputyGeneralPrefix', 'deputyGeneralName')}
                        {renderPersonnelField('หัวหน้าฝ่ายบริหารงานทั่วไป', 'generalHeadPrefix', 'generalHeadName')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {renderPersonnelField('เจ้าหน้าที่ระบบดูแลช่วยเหลือนักเรียน', 'studentSupportOfficerPrefix', 'studentSupportOfficerName')}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: System Features */}
              {currentStep === 5 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-6 bg-indigo-500 rounded-full mr-1"></span>
                    ตั้งค่าระบบงาน
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                    เลือกเปิด/ปิดระบบงานต่างๆ ให้เหมาะสมกับบริบทของโรงเรียน
                  </p>

                  <div className="space-y-4">
                    {[
                      { key: 'academic', label: 'กลุ่มบริหารงานวิชาการ', desc: 'ระบบจัดการหลักสูตร, ตารางสอน, วัดผลประเมินผล, งานทะเบียนนักเรียน' },
                      { key: 'studentAffairs', label: 'กลุ่มบริหารงานกิจการนักเรียน', desc: 'ระบบดูแลช่วยเหลือนักเรียน, เช็คชื่อ, คะแนนความประพฤติ, การเยี่ยมบ้าน' },
                      { key: 'personnel', label: 'กลุ่มบริหารงานบุคคล', desc: 'ฐานข้อมูลครูและบุคลากร, การลางาน, การประเมินผลการปฏิบัติงาน' },
                      { key: 'budget', label: 'กลุ่มบริหารงบประมาณ', desc: 'ระบบแผนงาน, การจัดซื้อจัดจ้าง, การเงินและพัสดุ' },
                      // 📌 'generalAdmin' (งานธุรการ) ย้ายไปเป็นสวิตช์เฉพาะ Owner ในหน้า "ข้อมูลทั่วไป" (Step 1) แล้ว — ไม่ให้ school_admin แก้จากตรงนี้
                      { key: 'director', label: 'ส่วนงานผู้อำนวยการ', desc: 'Dashboard ผู้บริหาร, ระบบอนุมัติเอกสาร, รายงานภาพรวม' },
                    ].map((feature) => (
                      <div key={feature.key} className="flex items-center justify-between p-5 bg-gray-50 dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${(info.features?.[feature.key as keyof typeof info.features] ?? true)
                            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                            : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                            <FaLayerGroup />
                          </div>
                          <div>
                            <p className="text-base font-bold text-gray-900 dark:text-white">{feature.label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{feature.desc}</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={info.features?.[feature.key as keyof typeof info.features] ?? true}
                            onChange={(e) => {
                              setInfo(prev => ({
                                ...prev,
                                features: {
                                  ...prev.features,
                                  [feature.key]: e.target.checked
                                }
                              }));
                            }}
                          />
                          <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>

                </div>
              )}

              {/* Step 6: License / MA / Contract (SUPER_ADMIN only) */}
              {currentStep === 6 && isSuperAdmin && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-1 h-6 bg-emerald-500 rounded-full mr-1"></span>
                    License / MA / สัญญา
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                    ข้อมูลส่วนนี้เห็นได้เฉพาะ Owner (SUPER_ADMIN) เท่านั้น ไม่แสดงกับผู้ดูแลของโรงเรียน
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        สถานะ License
                      </label>
                      <select
                        value={licenseInfo.licenseStatus || ''}
                        onChange={(e) => setLicenseInfo(prev => ({ ...prev, licenseStatus: (e.target.value || undefined) as LicenseStatus | undefined }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white"
                      >
                        <option value="">-- ยังไม่ระบุ --</option>
                        {(Object.keys(LICENSE_STATUS_LABELS) as LicenseStatus[]).map((status) => (
                          <option key={status} value={status}>{LICENSE_STATUS_LABELS[status]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        MA ถึงวันที่
                      </label>
                      <input
                        type="date"
                        value={licenseInfo.maExpiryDate || ''}
                        onChange={(e) => setLicenseInfo(prev => ({ ...prev, maExpiryDate: e.target.value || undefined }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white"
                      />
                      {licenseInfo.maExpiryDate && (() => {
                        const days = getDaysUntilMaExpiry(licenseInfo.maExpiryDate);
                        if (days === null) return null;
                        if (days < 0) return <p className="mt-1 text-[11px] text-red-500">หมดอายุแล้ว {Math.abs(days)} วันก่อน</p>;
                        if (days <= 30) return <p className="mt-1 text-[11px] text-amber-500">🔔 เหลืออีก {days} วันก่อนหมด MA</p>;
                        return <p className="mt-1 text-[11px] text-gray-400">เหลืออีก {days} วัน</p>;
                      })()}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        วันหมดอายุสัญญา
                      </label>
                      <input
                        type="date"
                        value={licenseInfo.contractExpiryDate || ''}
                        onChange={(e) => setLicenseInfo(prev => ({ ...prev, contractExpiryDate: e.target.value || undefined }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Backup ล่าสุด
                      </label>
                      <input
                        type="date"
                        value={licenseInfo.lastBackupAt || ''}
                        onChange={(e) => setLicenseInfo(prev => ({ ...prev, lastBackupAt: e.target.value || undefined }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-xs text-gray-900 dark:text-white"
                      />
                      <p className="mt-1 text-[11px] text-gray-400">กรอกด้วยมือ (ยังไม่มีระบบ backup อัตโนมัติ)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={currentStep === 1 ? () => navigate('/owner/schools') : handleBack}
                  className="px-5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 dark:bg-[#2a2b2f] dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition-all"
                >
                  {currentStep === 1 ? 'ยกเลิก' : 'ย้อนกลับ'}
                </button>

                {currentStep < steps.length && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); handleNext(); }}
                    className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <span>ถัดไป</span>
                    <FaChevronRight className="text-[10px]" />
                  </button>
                )}
                {currentStep === steps.length && (
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-lg shadow-green-500/20 hover:shadow-green-500/40 transform hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <span>บันทึกข้อมูล</span>
                    <FaChevronRight className="text-[10px]" />
                  </button>
                )}
              </div>

            </div>
          </form>
        </div>
      </div >
    </MainLayout >
  );
};

export default SchoolInfoPage;
