import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore } from '@/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import { 
  IdCard, Search, Download, ArrowLeft, Edit, Save, X, RefreshCcw, Camera, 
  Palette, Pipette, Bold, AlignLeft, AlignCenter, AlignRight,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Grid3X3, Undo, Redo
} from 'lucide-react';
import html2canvas from 'html2canvas';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import QRCode from "react-qr-code";
import defaultProfile from "@/assets/profile.png";

interface EyeDropper {
  open: () => Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: { new (): EyeDropper; };
  }
}

const FONT_FACES: { name: string; value: string }[] = [
  { name: 'TH Sarabun New', value: 'TH Sarabun New' },
  { name: 'Kanit', value: 'Kanit' },
  { name: 'Prompt', value: 'Prompt' },
  { name: 'Mitr', value: 'Mitr' },
  { name: 'Sarabun', value: 'Sarabun' },
  { name: 'Noto Sans Thai', value: 'Noto Sans Thai' },
  { name: 'Noto Serif Thai', value: 'Noto Serif Thai' },
  { name: 'Chakra Petch', value: 'Chakra Petch' },
  { name: 'Krub', value: 'Krub' },
  { name: 'Taviraj', value: 'Taviraj' },
  { name: 'Sriracha', value: 'Sriracha' },
];

interface UserData {
  id: string;
  name: string;
  role: 'teacher' | 'student';
  idNumber: string;
  position?: string;
  profileUrl?: string;
  academicStanding?: string;
  department?: string;
  subjectGroup?: string;
  bloodGroup?: string;
  issueDate?: string;
  expiryDate?: string;
}

interface SchoolData {
  schoolName?: string;
  logoUrl?: string;
  affiliation?: string;
  directorName?: string;
  address?: string;
}

interface Coordinate {
  x: number;
  y: number;
}

interface DragSession {
  targetId: string;
  startMouse: Coordinate;
  startItemPos: Coordinate;
}

interface ElementStyle {
  fontSize?: number;
  width?: number;
  height?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  color?: string;
  fontFamily?: string;
}

interface ResizingState {
  isResizing: boolean;
  elementId: string;
  corner: string;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startFontSize: number;
}

interface HistoryState {
  elementPos: Record<string, Coordinate>;
  elementStyles: Record<string, ElementStyle>;
  orientation: 'portrait' | 'landscape';
  bgImage: string | null;
}

const ResizableItem: React.FC<{
  id: string;
  children: React.ReactNode;
  xy: Coordinate;
  editable: boolean;
  selected: boolean;
  onDragStart: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onResizeStart: (e: React.MouseEvent<HTMLDivElement>, id: string, corner: string) => void;
  className?: string;
}> = ({ id, children, xy, editable, selected, onDragStart, onResizeStart, className }) => {
  let containerClass = '';
  if (editable) {
    if (selected) {
      containerClass = 'ring-2 ring-yellow-400 z-50 cursor-move';
    } else {
      containerClass = 'hover:ring-2 hover:ring-yellow-400/50 z-40 cursor-pointer';
    }
  }

  const handleBaseClass = "absolute bg-white border border-blue-500 shadow-sm z-50 transition-transform hover:scale-105";
  const cornerHandleClass = `${handleBaseClass} w-3 h-3 rounded-full -m-1.5`;
  const vHandleClass = `${handleBaseClass} w-1 h-4 rounded-full -ml-[2px] -mt-2`;

  return (
    <div
      onMouseDown={(e) => onDragStart(e, id)}
      className={`absolute transition-none flex flex-col items-center justify-center ${containerClass} ${className || ''}`}
      style={{
        left: xy.x,
        top: xy.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: editable ? 'auto' : 'none',
        userSelect: 'none',
        touchAction: 'none',
        whiteSpace: 'nowrap'
      }}
    >
      <div className="relative w-full h-full flex justify-center items-center">
        {children}
      </div>
      
      {editable && selected && (
        <>
          <div onMouseDown={(e) => onResizeStart(e, id, 'topLeft')} className={`${cornerHandleClass} top-0 left-0 cursor-nwse-resize`}></div>
          <div onMouseDown={(e) => onResizeStart(e, id, 'topRight')} className={`${cornerHandleClass} top-0 right-0 cursor-nesw-resize`}></div>
          <div onMouseDown={(e) => onResizeStart(e, id, 'bottomLeft')} className={`${cornerHandleClass} bottom-0 left-0 cursor-nesw-resize`}></div>
          <div onMouseDown={(e) => onResizeStart(e, id, 'bottomRight')} className={`${cornerHandleClass} bottom-0 right-0 cursor-nwse-resize`}></div>
          <div onMouseDown={(e) => onResizeStart(e, id, 'middleLeft')} className={`${vHandleClass} top-1/2 left-0 cursor-ew-resize`}></div>
          <div onMouseDown={(e) => onResizeStart(e, id, 'middleRight')} className={`${vHandleClass} top-1/2 right-0 cursor-ew-resize`}></div>
        </>
      )}
    </div>
  );
};

const CardBackground: React.FC<{ role: string; orientation: string }> = ({ role, orientation }) => {
  const isTeacher = role === 'teacher';
  const headerColor = isTeacher ? 'bg-[#1e3a8a]' : 'bg-[#db2777]';
  const subColor = isTeacher ? 'bg-[#fbbf24]' : 'bg-[#60a5fa]';
  
  if (orientation === 'portrait') {
    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-white">
            <div className={`absolute top-0 left-0 w-full h-[130px] ${headerColor} rounded-b-[40%] scale-x-125 origin-top`}></div>
            <div className={`absolute top-[120px] left-0 w-full h-[15px] ${subColor} opacity-80`}></div>
            <div className={`absolute bottom-0 left-0 w-full h-[60px] ${headerColor}`}></div>
            <div className={`absolute bottom-[60px] left-0 w-full h-[5px] ${subColor}`}></div>
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        </div>
    );
  } else {
    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-white">
            <div className={`absolute top-0 left-0 h-full w-[160px] ${headerColor}`}></div>
            <div className={`absolute top-0 left-[160px] h-full w-[10px] ${subColor}`}></div>
            <div className={`absolute top-0 right-0 w-[200px] h-[200px] ${subColor} opacity-10 rounded-full translate-x-1/2 -translate-y-1/2`}></div>
             <div className={`absolute bottom-0 right-0 w-full h-[20px] ${headerColor} opacity-10`}></div>
             <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        </div>
    );
  }
};

const IdCardPage: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolData | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [elementPos, setElementPos] = useState<Record<string, Coordinate>>({});
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resizingState, setResizingState] = useState<ResizingState | null>(null);
  
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [hasSavedHistoryForInteraction, setHasSavedHistoryForInteraction] = useState(false);
  const hasMoved = useRef(false);

  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyle>>({
    logo: { width: 80, height: 80, color: '#000000', fontFamily: 'Kanit' },
    schoolName: { fontSize: 20, width: 300, textAlign: 'center', fontWeight: 'bold', color: '#FFFFFF', fontFamily: 'Kanit' },
    profile: { width: 120, height: 150, color: '#000000', fontFamily: 'Kanit' },
    name: { fontSize: 22, width: 300, textAlign: 'center', fontWeight: 'bold', color: '#1e3a8a', fontFamily: 'Kanit' },
    position: { fontSize: 16, width: 280, textAlign: 'center', fontWeight: 'normal', color: '#374151', fontFamily: 'Kanit' },
    academicStanding: { fontSize: 14, width: 280, textAlign: 'center', fontWeight: 'normal', color: '#4b5563', fontFamily: 'Kanit' },
    department: { fontSize: 14, width: 280, textAlign: 'center', fontWeight: 'normal', color: '#4b5563', fontFamily: 'Kanit' },
    subjectGroup: { fontSize: 14, width: 280, textAlign: 'center', fontWeight: 'normal', color: '#4b5563', fontFamily: 'Kanit' },
    details: { fontSize: 12, width: 280, textAlign: 'center', fontWeight: 'normal', color: '#4b5563', fontFamily: 'Kanit' },
    dates: { fontSize: 11, width: 260, textAlign: 'center', fontWeight: 'normal', color: '#6b7280', fontFamily: 'Kanit' },
    director: { fontSize: 12, width: 150, textAlign: 'center', fontWeight: 'bold', color: '#374151', fontFamily: 'Kanit' },
    qrCode: { width: 70, height: 70, color: '#000000' },
  });

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [bgImage, setBgImage] = useState<string | null>(null);
  
  const cardNode = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const canvasWidth = orientation === 'portrait' ? 320 : 512;
  const canvasHeight = orientation === 'portrait' ? 512 : 320;

  const defaultLayouts = {
    portrait: {
      logo: { x: 160, y: 50 },
      schoolName: { x: 160, y: 100 },
      profile: { x: 160, y: 190 },
      name: { x: 160, y: 280 },
      position: { x: 160, y: 310 },
      academicStanding: { x: 160, y: 330 },
      department: { x: 160, y: 350 },
      subjectGroup: { x: 160, y: 370 },
      details: { x: 160, y: 400 },
      dates: { x: 80, y: 435 },
      director: { x: 240, y: 435 },
      qrCode: { x: 160, y: 485 }, 
    },
    landscape: {
      logo: { x: 75, y: 60 },
      profile: { x: 75, y: 190 },
      schoolName: { x: 335, y: 45 },
      name: { x: 335, y: 95 },
      position: { x: 335, y: 125 },
      academicStanding: { x: 335, y: 145 },
      department: { x: 335, y: 165 },
      subjectGroup: { x: 335, y: 185 },
      details: { x: 335, y: 220 },
      dates: { x: 260, y: 260 },
      director: { x: 420, y: 260 },
      qrCode: { x: 470, y: 60 },
    }
  };

  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [bulkClass, setBulkClass] = useState<string>('');

  useEffect(() => {
    if (!schoolId) return;
    const initData = async () => {
      setLoading(true);
      try {
        const docRef = doc(firestore, 'school-settings', schoolId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSchoolInfo({
            ...data,
            schoolName: data.schoolName || 'โรงเรียนตัวอย่าง',
            affiliation: data.affiliation || 'สำนักงานเขตพื้นที่การศึกษา',
            directorName: data.directorName || '(..........................................)',
          } as SchoolData);
          const savedTemplate = data.idCardTemplate;
          setElementPos({
            ...defaultLayouts.portrait,
            ...defaultLayouts.landscape,
            ...(savedTemplate?.portrait || {}),
            ...(savedTemplate?.landscape || {})
          });
        } else {
            setElementPos({ ...defaultLayouts.portrait, ...defaultLayouts.landscape });
        }

        const [teachersSnap, studentsSnap] = await Promise.all([
            getDocs(collection(firestore, 'school-settings', schoolId, 'teachers')),
            getDocs(collection(firestore, 'school-settings', schoolId, 'students'))
        ]);

        const today = new Date();
        const next3Years = new Date();
        next3Years.setFullYear(today.getFullYear() + 3);
        const dateStr = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

        const mapUser = (doc: any, role: 'teacher' | 'student'): UserData => {
            const d = doc.data();
            const fullName = d.fullName || d.name || `${d.title || ''}${d.firstName || ''} ${d.lastName || ''}`.trim();
            let pos = role === 'teacher' ? (d.position || 'ครูผู้สอน') : `นักเรียนชั้น ${d.classLevel || '-'}/${d.room || '-'}`;
            let academicStanding = d.academicStanding || '-'; // Default to '-' if empty to ensure visibility

            return {
                id: doc.id,
                name: fullName,
                role,
                idNumber: d.teacherId || d.studentId || d.idNumber || doc.id,
                position: pos,
                profileUrl: d.profileImageUrl,
                academicStanding, 
                department: d.department || '-', 
                subjectGroup: d.learningArea || '-',
                bloodGroup: d.bloodGroup || '-',
                issueDate: dateStr(today),
                expiryDate: dateStr(next3Years)
            };
        };

        const allUsers = [...teachersSnap.docs.map(d => mapUser(d, 'teacher')), ...studentsSnap.docs.map(d => mapUser(d, 'student'))];
        setUsers(allUsers);
        
        const classes = new Set(allUsers.filter(u => u.role === 'student').map(s => {
            const parts = s.position?.split(' ');
            return parts && parts.length > 1 ? parts[2] : ''; 
        }).filter(Boolean));
        const sorted = Array.from(classes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setClassOptions(sorted);
        if (sorted.length > 0) setBulkClass(sorted[0]);

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initData();
  }, [schoolId]);

  const handleAlignHorizontal = () => {
    if (!selectedId) return;
    saveToHistory();
    setElementPos(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], x: canvasWidth / 2 } }));
  };

  const handleAlignVertical = () => {
    if (!selectedId) return;
    saveToHistory();
    setElementPos(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], y: canvasHeight / 2 } }));
  };

  const handleSnapToGrid = () => {
    if (!selectedId) return;
    saveToHistory();
    setElementPos(prev => {
        const current = prev[selectedId];
        const snappedX = Math.round(current.x / 10) * 10;
        const snappedY = Math.round(current.y / 10) * 10;
        return { ...prev, [selectedId]: { x: snappedX, y: snappedY } };
    });
  };

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    if (!isEditMode || resizingState) return;
    e.stopPropagation();
    setSelectedId(id);
    setHasSavedHistoryForInteraction(false);
    hasMoved.current = false;
    const currentXY = elementPos[id] || { x: 0, y: 0 };
    setDragSession({ targetId: id, startMouse: { x: e.clientX, y: e.clientY }, startItemPos: { x: currentXY.x, y: currentXY.y } });
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, id: string, corner: string) => {
    if (!isEditMode) return;
    e.stopPropagation(); e.preventDefault();
    const style = elementStyles[id] || {};
    setHasSavedHistoryForInteraction(false);
    setResizingState({
      isResizing: true, elementId: id, corner,
      startX: e.clientX, startY: e.clientY,
      startWidth: style.width || 0, startHeight: style.height || 0, startFontSize: style.fontSize || 0,
    });
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (!isEditMode) return;
      e.preventDefault();

      if (dragSession) {
        hasMoved.current = true;
        if (!hasSavedHistoryForInteraction) { saveToHistory(); setHasSavedHistoryForInteraction(true); }
        const dx = e.clientX - dragSession.startMouse.x;
        const dy = e.clientY - dragSession.startMouse.y;
        setElementPos((prev) => ({ ...prev, [dragSession.targetId]: { x: dragSession.startItemPos.x + dx, y: dragSession.startItemPos.y + dy } }));
      } else if (resizingState) {
        if (!hasSavedHistoryForInteraction) { saveToHistory(); setHasSavedHistoryForInteraction(true); }
        const { startX, startY, startWidth, startHeight, startFontSize, corner, elementId } = resizingState;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const isText = !!elementStyles[elementId]?.fontSize;

        if (corner.includes('middle')) {
            const widthChange = dx * (corner === 'middleRight' ? 1 : -1) * 2;
            updateElementStyle(elementId, 'width', Math.max(20, startWidth + widthChange), false);
        } else if (corner.includes('Center')) {
             if (!isText) {
                const heightChange = dy * (corner === 'bottomCenter' ? 1 : -1) * 2;
                updateElementStyle(elementId, 'height', Math.max(20, startHeight + heightChange), false);
             }
        } else {
             if (isText) {
                let sizeChange = (dy + dx) / 2 * (corner.includes('top') ? -1 : 1);
                updateElementStyle(elementId, 'fontSize', Math.max(8, Math.round(startFontSize + sizeChange)), false);
             } else {
                const change = (dx + dy) / 2 * (corner.includes('Right') ? 1 : -1) * 2;
                if (elementId === 'qrCode') {
                    const newSize = Math.max(40, startWidth + change);
                    updateElementStyle(elementId, 'width', newSize, false);
                    updateElementStyle(elementId, 'height', newSize, false);
                } else {
                    const ratio = startWidth / (startHeight || 1);
                    const newWidth = Math.max(20, startWidth + change);
                    updateElementStyle(elementId, 'width', newWidth, false);
                    updateElementStyle(elementId, 'height', newWidth / ratio, false);
                }
             }
        }
      }
    };
    const handleGlobalUp = () => { setDragSession(null); setResizingState(null); setHasSavedHistoryForInteraction(false); };
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    return () => { window.removeEventListener('mousemove', handleGlobalMove); window.removeEventListener('mouseup', handleGlobalUp); };
  }, [isEditMode, dragSession, resizingState, elementStyles]);

  const saveToHistory = () => {
    const currentState: HistoryState = { elementPos: JSON.parse(JSON.stringify(elementPos)), elementStyles: JSON.parse(JSON.stringify(elementStyles)), orientation: orientation, bgImage: bgImage, };
    setHistory(prev => [...prev, currentState]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    const currentState: HistoryState = { elementPos: JSON.parse(JSON.stringify(elementPos)), elementStyles: JSON.parse(JSON.stringify(elementStyles)), orientation: orientation, bgImage: bgImage, };
    setRedoStack(prev => [...prev, currentState]);
    setElementPos(previousState.elementPos);
    setElementStyles(previousState.elementStyles);
    setOrientation(previousState.orientation);
    setBgImage(previousState.bgImage);
    setHistory(newHistory);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    const currentState: HistoryState = { elementPos: JSON.parse(JSON.stringify(elementPos)), elementStyles: JSON.parse(JSON.stringify(elementStyles)), orientation: orientation, bgImage: bgImage, };
    setHistory(prev => [...prev, currentState]);
    setElementPos(nextState.elementPos);
    setElementStyles(nextState.elementStyles);
    setOrientation(nextState.orientation);
    setBgImage(nextState.bgImage);
    setRedoStack(newRedoStack);
  };

  const updateElementStyle = (elementId: string | null, key: keyof ElementStyle, value: any, saveHistoryFlag = true) => {
    if (!elementId) return;
    if (saveHistoryFlag) saveToHistory();
    setElementStyles(prev => ({ ...prev, [elementId]: { ...prev[elementId], [key]: value } }));
  };

  const handleColorPick = async () => {
    if (!('EyeDropper' in window)) return Swal.fire('เบราว์เซอร์ไม่รองรับ', 'ฟีเจอร์ดูดสีไม่สามารถใช้งานได้บนเบราว์เซอร์ของคุณ', 'warning');
    if (!selectedId) return;
    saveToHistory();
    try {
      const eyeDropper = new (window as any).EyeDropper();
      const { sRGBHex } = await eyeDropper.open();
      updateElementStyle(selectedId, 'color', sRGBHex);
    } catch (e) { console.log('Color picking cancelled.'); }
  };

  useEffect(() => {
    if (selectedPerson) {
        setElementStyles(prev => ({ ...prev,
            name: { ...prev.name, color: selectedPerson.role === 'teacher' ? '#1e3a8a' : '#3730a3' },
        }));
    }
  }, [selectedPerson]);

  const displayUsers = users.filter(u => u.name.toLowerCase().includes(keyword.toLowerCase()) || u.idNumber.includes(keyword)).slice(0, 50);

  const saveLayout = async () => {
    if (!schoolId) return;
    saveToHistory();
    try {
      const pKeys = Object.keys(defaultLayouts.portrait);
      const lKeys = Object.keys(defaultLayouts.landscape);
      const pData = Object.fromEntries(Object.entries(elementPos).filter(([k]) => pKeys.includes(k)));
      const lData = Object.fromEntries(Object.entries(elementPos).filter(([k]) => lKeys.includes(k)));
      await setDoc(doc(firestore, 'school-settings', schoolId), { idCardTemplate: { portrait: pData, landscape: lData } }, { merge: true });
      Swal.fire({ icon: 'success', title: 'บันทึก Layout เรียบร้อย', timer: 1200, showConfirmButton: false });
      setIsEditMode(false);
    } catch (err) { Swal.fire('Error', 'บันทึกไม่สำเร็จ', 'error'); }
  };

  const resetLayout = () => {
    saveToHistory();
    setElementPos({ ...defaultLayouts.portrait, ...defaultLayouts.landscape });
    Swal.fire({ icon: 'info', title: 'รีเซ็ตตำแหน่งแล้ว', timer: 1000, showConfirmButton: false });
  };

  const exportSingleCard = async () => {
    if (!cardNode.current || !selectedPerson) return;
    const cvs = await html2canvas(cardNode.current, { scale: 3, useCORS: true, backgroundColor: null });
    const link = document.createElement('a');
    link.download = `Card_${selectedPerson.idNumber}.png`;
    link.href = cvs.toDataURL('image/png');
    link.click();
  };

  const exportBulkPDF = async () => {
    if (!cardNode.current || !bulkClass) return;
    const targetStudents = users.filter(u => u.role === 'student' && u.position?.includes(bulkClass));
    if (targetStudents.length === 0) return Swal.fire('Info', 'ไม่พบนักเรียน', 'info');
    Swal.fire({ title: 'กำลังสร้าง PDF...', html: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const w = orientation === 'portrait' ? 320 : 512;
    const h = orientation === 'portrait' ? 512 : 320;
    const docPdf = new jsPDF({ orientation, unit: 'px', format: [w, h] });

    for (let i = 0; i < targetStudents.length; i++) {
      setSelectedPerson(targetStudents[i]);
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(cardNode.current, { scale: 2, useCORS: true, backgroundColor: null, logging: false });
      if (i > 0) docPdf.addPage();
      docPdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
    }
    docPdf.save(`Student_Cards_${bulkClass}.pdf`);
    Swal.close();
  };

  const handleUploadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveToHistory();
    if (e.target.files?.[0]) {
        const fr = new FileReader();
        fr.onload = (ev) => setBgImage(ev.target?.result as string);
        fr.readAsDataURL(e.target.files[0]);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 min-h-screen">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div className="w-full md:w-auto flex items-center gap-4">
              <BackButton to="/human-resources/hub" />
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <IdCard className="text-indigo-600" /> ระบบทำบัตรประจำตัว
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col flex-1">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg outline-none" 
                        placeholder="ค้นหาชื่อ..." value={keyword} onChange={e => setKeyword(e.target.value)} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                 {displayUsers.map(u => (
                    <div key={u.id} onClick={() => setSelectedPerson(u)}
                        className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition ${selectedPerson?.id === u.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <img src={u.profileUrl || defaultProfile} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 object-cover" />
                        <div>
                            <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">{u.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{u.role === 'teacher' ? 'ครู/บุคลากร' : u.position}</p>
                        </div>
                    </div>
                 ))}
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="bg-white dark:bg-[#2a2b2f] p-3 rounded-xl shadow-sm border flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${isEditMode ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'}`}>
                        {isEditMode ? <><X size={16}/> เสร็จสิ้น</> : <><Edit size={16}/> จัดตำแหน่ง</>}
                    </button>
                    {isEditMode && (
                      <>
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border">
                           <button onClick={handleUndo} disabled={history.length === 0} className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded disabled:opacity-30"><Undo size={16}/></button>
                           <button onClick={handleRedo} disabled={redoStack.length === 0} className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded disabled:opacity-30"><Redo size={16}/></button>
                        </div>
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>
                        <button onClick={resetLayout} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300" title="รีเซ็ตตำแหน่ง"><RefreshCcw size={16}/></button>
                        <button onClick={saveLayout} className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200" title="บันทึก"><Save size={16}/></button>
                      </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button onClick={() => setOrientation('portrait')} className={`px-3 py-1 text-xs rounded ${orientation === 'portrait' ? 'bg-white shadow' : ''}`}>แนวตั้ง</button>
                        <button onClick={() => setOrientation('landscape')} className={`px-3 py-1 text-xs rounded ${orientation === 'landscape' ? 'bg-white shadow' : ''}`}>แนวนอน</button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleUploadBg} hidden accept="image/*"/>
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Camera size={16}/></button>
                    {bgImage && <button onClick={() => setBgImage(null)} className="text-xs text-red-500">ลบรูป</button>}
                </div>
              </div>

              {isEditMode && (
                <div className="bg-white dark:bg-[#2a2b2f] p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className={`flex items-center justify-between gap-4 transition-opacity duration-300 ${selectedId ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 h-[38px]">
                        <button onClick={handleAlignHorizontal} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="จัดกึ่งกลางแนวนอน"><AlignHorizontalJustifyCenter size={16} /></button>
                        <button onClick={handleAlignVertical} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="จัดกึ่งกลางแนวตั้ง"><AlignVerticalJustifyCenter size={16} /></button>
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={handleSnapToGrid} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="Snap to Grid (10px)"><Grid3X3 size={16} /></button>
                    </div>
                    
                    {/* Font Family */}
                      <select
                          value={selectedId && elementStyles[selectedId]?.fontFamily ? elementStyles[selectedId].fontFamily : 'Kanit'}
                          onChange={(e) => updateElementStyle(selectedId, 'fontFamily', e.target.value)}
                          className="w-36 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                      >
                          {FONT_FACES.map(font => (
                              <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>{font.name}</option>
                          ))}
                      </select>

                    {/* Font Style & Alignment */}
                      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 h-[38px]">
                        <button onClick={() => selectedId && elementStyles[selectedId] && updateElementStyle(selectedId, 'fontWeight', elementStyles[selectedId].fontWeight === 'bold' ? 'normal' : 'bold')} className={`p-1.5 rounded-md transition-all ${selectedId && elementStyles[selectedId]?.fontWeight === 'bold' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700'}`} title="ตัวหนา"><Bold size={16} /></button>
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => updateElementStyle(selectedId, 'textAlign', 'left')} className={`p-1.5 rounded-md transition-all ${selectedId && elementStyles[selectedId!]?.textAlign === 'left' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700'}`} title="ชิดซ้าย"><AlignLeft size={16} /></button>
                        <button onClick={() => updateElementStyle(selectedId, 'textAlign', 'center')} className={`p-1.5 rounded-md transition-all ${selectedId && elementStyles[selectedId!]?.textAlign === 'center' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700'}`} title="กึ่งกลาง"><AlignCenter size={16} /></button>
                        <button onClick={() => updateElementStyle(selectedId, 'textAlign', 'right')} className={`p-1.5 rounded-md transition-all ${selectedId && elementStyles[selectedId!]?.textAlign === 'right' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700'}`} title="ชิดขวา"><AlignRight size={16} /></button>
                      </div>
                    

                    {/* Color Picker */}
                    <div className="flex items-center gap-2">
                      <div className="relative group cursor-pointer">
                          <div 
                              className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-500 shadow-inner"
                              style={{ backgroundColor: selectedId && elementStyles[selectedId]?.color ? elementStyles[selectedId]?.color : '#000000' }}
                          >
                              <input 
                                  type="color" 
                                  value={selectedId && elementStyles[selectedId]?.color ? elementStyles[selectedId]?.color : '#000000'} 
                                  onChange={(e) => updateElementStyle(selectedId, 'color', e.target.value)}
                                  className="opacity-0 w-full h-full cursor-pointer absolute inset-0"
                              />
                          </div>
                      </div>
                      {'EyeDropper' in window && (
                          <button onClick={handleColorPick} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" title="ดูดสี"><Pipette size={18} /></button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 bg-gray-100 dark:bg-gray-900/50 rounded-xl flex items-center justify-center p-6 overflow-hidden border border-dashed border-gray-300">
                {selectedPerson ? (
                    <div className="relative group shadow-2xl transition-all duration-300">
                        <div ref={cardNode} className="bg-white relative overflow-hidden text-gray-900 select-none"
                            style={{ width: orientation === 'portrait' ? '320px' : '512px', height: orientation === 'portrait' ? '512px' : '320px', backgroundImage: bgImage ? `url(${bgImage})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                            
                            {!bgImage && <CardBackground role={selectedPerson.role} orientation={orientation} />}

                            <ResizableItem id="logo" xy={elementPos.logo || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'logo'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div style={{ width: elementStyles.logo?.width, height: elementStyles.logo?.height }}>
                                  <img src={schoolInfo?.logoUrl || defaultProfile} className="w-full h-full object-contain drop-shadow-md bg-white rounded-full p-1" />
                                </div>
                            </ResizableItem>

                            <ResizableItem id="schoolName" xy={elementPos.schoolName || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'schoolName'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div style={{ width: elementStyles.schoolName?.width, textAlign: elementStyles.schoolName?.textAlign }}>
                                  <h2 className="drop-shadow-md leading-tight" style={{ fontSize: `${elementStyles.schoolName?.fontSize}px`, fontWeight: elementStyles.schoolName?.fontWeight, color: elementStyles.schoolName?.color, fontFamily: elementStyles.schoolName?.fontFamily }}>{schoolInfo?.schoolName}</h2>
                                  <p className="truncate opacity-90" style={{ fontSize: `${(elementStyles.schoolName?.fontSize || 18) * 0.6}px`, color: elementStyles.schoolName?.color, fontFamily: elementStyles.schoolName?.fontFamily }}>{schoolInfo?.affiliation}</p>
                                </div>
                            </ResizableItem>

                            <ResizableItem id="profile" xy={elementPos.profile || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'profile'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div className={`bg-gray-200 border-[3px] shadow-md overflow-hidden rounded-xl ${selectedPerson.role === 'teacher' ? 'border-[#fbbf24]' : 'border-[#f472b6]'}`}
                                  style={{ width: elementStyles.profile?.width, height: elementStyles.profile?.height }}>
                                  <img 
                                    src={selectedPerson.profileUrl || defaultProfile} 
                                    className="w-full h-full object-cover bg-white" 
                                    onError={(e) => { (e.target as HTMLImageElement).src = defaultProfile; }}
                                  />
                                </div>
                            </ResizableItem>

                            <ResizableItem id="name" xy={elementPos.name || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'name'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div style={{ width: elementStyles.name?.width, textAlign: elementStyles.name?.textAlign }}>
                                  <h3 style={{ fontSize: `${elementStyles.name?.fontSize}px`, fontWeight: elementStyles.name?.fontWeight, color: elementStyles.name?.color, fontFamily: elementStyles.name?.fontFamily }}>{selectedPerson.name}</h3>
                                </div>
                            </ResizableItem>

                            {/* ✅ แก้ไข Position ให้เป็น Text ธรรมดา + มีคำนำหน้า */}
                            <ResizableItem id="position" xy={elementPos.position || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'position'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div style={{ width: elementStyles.position?.width, textAlign: elementStyles.position?.textAlign }}>
                                  <span style={{ fontSize: `${elementStyles.position?.fontSize}px`, fontWeight: elementStyles.position?.fontWeight, color: elementStyles.position?.color, fontFamily: elementStyles.position?.fontFamily }}>
                                    <span className="font-bold">ตำแหน่ง: </span>{selectedPerson.position}
                                  </span>
                                </div>
                            </ResizableItem>

                            {selectedPerson.role === 'teacher' && (
                                <>
                                    <ResizableItem id="academicStanding" xy={elementPos.academicStanding || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'academicStanding'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                    <div style={{ width: elementStyles.academicStanding?.width, textAlign: elementStyles.academicStanding?.textAlign }}>
                                        <span style={{ fontSize: `${elementStyles.academicStanding?.fontSize}px`, fontWeight: elementStyles.academicStanding?.fontWeight, color: elementStyles.academicStanding?.color, fontFamily: elementStyles.academicStanding?.fontFamily }}>
                                            <span className="font-bold">วิทยฐานะ: </span>{selectedPerson.academicStanding || '-'}
                                        </span>
                                    </div>
                                </ResizableItem>

                                    <ResizableItem id="department" xy={elementPos.department || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'department'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                    <div style={{ width: elementStyles.department?.width, textAlign: elementStyles.department?.textAlign }}>
                                        <span style={{ fontSize: `${elementStyles.department?.fontSize}px`, fontWeight: elementStyles.department?.fontWeight, color: elementStyles.department?.color, fontFamily: elementStyles.department?.fontFamily }}>
                                            <span className="font-bold">ฝ่ายงาน: </span>{selectedPerson.department || '-'}
                                        </span>
                                    </div>
                                </ResizableItem>

                                    <ResizableItem id="subjectGroup" xy={elementPos.subjectGroup || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'subjectGroup'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                    <div style={{ width: elementStyles.subjectGroup?.width, textAlign: elementStyles.subjectGroup?.textAlign }}>
                                        <span style={{ fontSize: `${elementStyles.subjectGroup?.fontSize}px`, fontWeight: elementStyles.subjectGroup?.fontWeight, color: elementStyles.subjectGroup?.color, fontFamily: elementStyles.subjectGroup?.fontFamily }}>
                                            <span className="font-bold">กลุ่มสาระฯ: </span>{selectedPerson.subjectGroup || '-'}
                                        </span>
                                    </div>
                                </ResizableItem>
                                </>
                            )}

                            <ResizableItem id="details" xy={elementPos.details || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'details'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div style={{ width: elementStyles.details?.width, textAlign: elementStyles.details?.textAlign }}>
                                  <div className="inline-block px-2" style={{ fontSize: `${elementStyles.details?.fontSize}px`, fontWeight: elementStyles.details?.fontWeight, color: elementStyles.details?.color, fontFamily: elementStyles.details?.fontFamily }}>
                                    <span className="font-bold" style={{ color: elementStyles.details?.color || '#1f2937' }}>รหัส:</span> {selectedPerson.idNumber} &bull; <span className="font-bold" style={{ color: elementStyles.details?.color || '#1f2937' }}>เลือด:</span> {selectedPerson.bloodGroup}
                                  </div>
                                </div>
                            </ResizableItem>

                            <ResizableItem id="dates" xy={elementPos.dates || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'dates'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div className="flex items-center justify-center" style={{ width: elementStyles.dates?.width, textAlign: elementStyles.dates?.textAlign }}>
                                    <div className="whitespace-nowrap flex items-center justify-center gap-2" style={{ fontSize: `${elementStyles.dates?.fontSize}px`, fontWeight: elementStyles.dates?.fontWeight, color: elementStyles.dates?.color, fontFamily: elementStyles.dates?.fontFamily }}>
                                        <span className="opacity-80">ออกบัตร: {selectedPerson.issueDate}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="opacity-80">หมดอายุ: {selectedPerson.expiryDate}</span>
                                    </div>
                                </div>
                            </ResizableItem>

                            <ResizableItem id="director" xy={elementPos.director || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'director'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div className="flex flex-col items-center" style={{ width: elementStyles.director?.width }}>
                                  <div className="h-6 w-full"></div> 
                                  <p className="border-t border-gray-400 pt-1 w-full truncate text-center" style={{ fontSize: `${elementStyles.director?.fontSize}px`, fontWeight: elementStyles.director?.fontWeight, color: elementStyles.director?.color, fontFamily: elementStyles.director?.fontFamily }}>{schoolInfo?.directorName}</p>
                                  <p className="text-center opacity-80" style={{ fontSize: `${(elementStyles.director?.fontSize || 10) * 0.8}px`, color: elementStyles.director?.color, fontFamily: elementStyles.director?.fontFamily }}>ผู้อำนวยการสถานศึกษา</p>
                                </div>
                            </ResizableItem>

                            {/* QR Code Element */}
                            <ResizableItem id="qrCode" xy={elementPos.qrCode || {x:0,y:0}} editable={isEditMode} selected={selectedId === 'qrCode'} onDragStart={handleDragStart} onResizeStart={handleResizeStart}>
                                <div className="bg-white p-1" style={{ width: elementStyles.qrCode?.width, height: elementStyles.qrCode?.height }}>
                                    <div style={{ width: '100%', height: '100%' }}>
                                        <QRCode
                                            size={256}
                                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                            value={selectedPerson.idNumber}
                                            viewBox={`0 0 256 256`}
                                            fgColor={elementStyles.qrCode?.color || '#000000'}
                                        />
                                    </div>
                                </div>
                            </ResizableItem>

                        </div>
                        
                        {!isEditMode && (
                            <div className="absolute -bottom-14 left-1/2 transform -translate-x-1/2 flex gap-2">
                                <button onClick={exportSingleCard} className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 rounded-full shadow-lg hover:scale-105 transition text-sm">
                                    <Download size={16} /> บันทึกรูป
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center text-gray-400">
                        <IdCard size={48} className="mx-auto mb-2 opacity-50"/>
                        <p>เลือกรายชื่อเพื่อแสดงตัวอย่าง</p>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default IdCardPage;