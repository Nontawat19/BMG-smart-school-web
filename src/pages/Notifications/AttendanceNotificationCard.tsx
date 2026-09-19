import React from "react";
import { useTheme } from "@/ThemeContext";

export interface AttendanceNotificationPayload {
  studentId: string;
  name: string;
  displayId: string;
  grade: string;
  room: string;
  profileImageUrl: string;
  status: string;
  actionType: string;
  time: string;
  scanMethod: string;
  faceScanImageUrl: string;
  faceConfidence: number | null;
  behaviorScore: number;
  stats: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    noCheckout: number;
    officialTravel: number;
  };
}

const STAT_ROWS: { key: keyof AttendanceNotificationPayload["stats"]; dot: string; label: string }[] = [
  { key: "present", dot: "🟢", label: "มาเรียน" },
  { key: "late", dot: "🟡", label: "สาย" },
  { key: "absent", dot: "🔴", label: "ขาด" },
  { key: "leave", dot: "🔵", label: "ลา" },
  { key: "noCheckout", dot: "🟠", label: "ไม่ลงเวลาออก" },
  { key: "officialTravel", dot: "🟣", label: "ไปร่วมกิจกรรม" },
];

// พื้นหลังกราฟ (QuickChart) โปร่งใสเสมอ ตัวหนังสือ/เส้นขอบวงแหวนตรงกลางเลยต้องปรับสีให้
// "กลืนไปกับพื้นกล่องสถิติที่มันวางอยู่" ในแต่ละธีม ไม่งั้นตัวหนังสือสีเข้มจะจมหายในกล่องพื้นเข้ม
// (แก้ปัญหาแบบเดียวกับที่ LINE ไม่ต้องเจอ เพราะบับเบิล LINE เป็นพื้นขาวตายตัวเสมอ)
const buildChartUrl = (stats: AttendanceNotificationPayload["stats"], isDarkMode: boolean) => {
  const totalDays = stats.present + stats.late + stats.absent + stats.leave + stats.noCheckout + stats.officialTravel;
  const boxBg = isDarkMode ? "#1e1f21" : "#fcfcfc";
  const primaryText = isDarkMode ? "#f3f4f6" : "#333333";
  const secondaryText = isDarkMode ? "#9ca3af" : "#666666";

  const chartConfig = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [
            totalDays === 0 ? 1 : stats.present,
            stats.late,
            stats.absent,
            stats.leave,
            stats.noCheckout,
            stats.officialTravel,
          ],
          backgroundColor: ["#1DB446", "#FFC107", "#FF5722", "#00BCD4", "#FF9800", "#9C27B0"],
          borderWidth: 2,
          borderColor: boxBg,
        },
      ],
    },
    options: {
      plugins: {
        datalabels: { display: false },
        doughnutlabel: {
          labels: [
            { text: String(totalDays), font: { size: 26, weight: "bold", family: "sans-serif" }, color: primaryText },
            { text: "วัน", font: { size: 14, family: "sans-serif" }, color: secondaryText },
          ],
        },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=200&h=200`;
};

interface AttendanceNotificationCardProps {
  attendance: AttendanceNotificationPayload;
  compact?: boolean;
}

const AttendanceNotificationCard: React.FC<AttendanceNotificationCardProps> = ({ attendance, compact = false }) => {
  const { isDarkMode } = useTheme();
  const {
    name, displayId, grade, room, profileImageUrl, status, actionType, time,
    faceScanImageUrl, faceConfidence, behaviorScore, stats,
  } = attendance;

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const isLate = status === "สาย";
  const isLeave = status === "ลา" || (status || "").startsWith("ลา");
  const isAbsent = status === "ขาด";

  let bubbleBg = "bg-emerald-50 dark:bg-emerald-500/10";
  let bubbleIconBg = "bg-emerald-500";
  let bubbleIcon = "✓";
  let bubbleText = "text-emerald-800 dark:text-emerald-300";
  if (isLate) {
    bubbleBg = "bg-amber-50 dark:bg-amber-500/10";
    bubbleIconBg = "bg-amber-400";
    bubbleIcon = "!";
    bubbleText = "text-amber-800 dark:text-amber-300";
  } else if (isLeave) {
    bubbleBg = "bg-blue-50 dark:bg-blue-500/10";
    bubbleIconBg = "bg-blue-500";
    bubbleIcon = "i";
    bubbleText = "text-blue-800 dark:text-blue-300";
  } else if (isAbsent) {
    bubbleBg = "bg-rose-50 dark:bg-rose-500/10";
    bubbleIconBg = "bg-rose-500";
    bubbleIcon = "x";
    bubbleText = "text-rose-800 dark:text-rose-300";
  }

  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const bubbleMessage = isCheckout ? "บุตรหลาน/นักเรียนกำลังเดินทางกลับ" : (isLate ? "กรุณามาให้ทันเวลาในครั้งถัดไป" : "ทำรายการสำเร็จ");
  const gradeRoom = grade ? `${grade}${room ? `/${room}` : ""}` : "";
  const avatarUrl = profileImageUrl?.startsWith("https://")
    ? profileImageUrl
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff&size=200`;

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f] ${compact ? "p-3 sm:p-3.5 w-full" : "p-5"}`}>
      {/* Header */}
      <div className={`flex items-center ${compact ? "gap-2.5" : "gap-4"}`}>
        <img
          src={avatarUrl}
          alt={name}
          className={`shrink-0 rounded-full object-cover object-[center_20%] ${compact ? "h-10 w-10" : "h-14 w-14"}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold text-gray-900 dark:text-white ${compact ? "text-sm" : "text-base"}`}>{name}</p>
          <p className={`text-gray-500 dark:text-gray-400 ${compact ? "text-xs" : "text-sm"}`}>
            {gradeRoom}{gradeRoom && displayId ? " • " : ""}{displayId}
          </p>
        </div>
      </div>

      {/* Stats box */}
      <div className={`rounded-xl border border-gray-100 bg-[#fcfcfc] dark:border-gray-700 dark:bg-[#1e1f21] ${compact ? "mt-2.5 p-2.5" : "mt-4 p-4"}`}>
        <p className={`font-bold text-gray-800 dark:text-gray-200 ${compact ? "mb-2 text-xs" : "mb-3 text-sm"}`}>
          สถานะการเข้าเรียน ภาคเรียนนี้
        </p>
        <div className={`flex items-center ${compact ? "gap-2" : "gap-4"}`}>
          <div className={`flex-1 ${compact ? "space-y-1 text-xs" : "space-y-1.5 text-sm"}`}>
            {STAT_ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400 truncate mr-1">
                  <span className="mr-1">{row.dot}</span>{row.label}
                </span>
                <span className="font-bold text-gray-900 dark:text-white">{stats[row.key]}</span>
              </div>
            ))}
          </div>
          <img
            src={buildChartUrl(stats, isDarkMode)}
            alt="สรุปสถิติ"
            className={`shrink-0 ${compact ? "h-20 w-20" : "h-24 w-24"}`}
          />
        </div>
      </div>

      {/* Status bubble */}
      <div className={`flex items-center rounded-xl ${bubbleBg} ${compact ? "mt-2.5 p-2.5 gap-2.5" : "mt-3 p-3 gap-3"}`}>
        <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${bubbleIconBg} ${compact ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"}`}>
          {bubbleIcon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${bubbleText} ${compact ? "text-xs leading-tight" : "text-sm"}`}>
            {name} {displayStatusText}แล้วเวลา {time} น.
          </p>
          <p className={`${bubbleText} ${compact ? "text-[11px] leading-tight mt-0.5" : "text-xs"}`}>
            {bubbleMessage}
          </p>
        </div>
      </div>

      {/* Behavior score */}
      <div className={`rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-[#2a2b2f] ${compact ? "mt-2.5 p-2.5" : "mt-3 p-4"}`}>
        <div className="flex items-center justify-between">
          <p className={`font-bold text-gray-800 dark:text-gray-200 ${compact ? "text-xs" : "text-sm"}`}>คะแนนพฤติกรรม ภาคเรียนนี้</p>
        </div>
        <div className={`flex items-end justify-between ${compact ? "mt-1" : "mt-2"}`}>
          <div>
            <p className={`font-black ${compact ? "text-xl" : "text-2xl"} ${behaviorScore >= 80 ? "text-emerald-500" : "text-amber-500"}`}>
              {behaviorScore}/100
            </p>
            <p className={`text-gray-400 ${compact ? "text-[11px]" : "text-xs"}`}>
              {behaviorScore >= 80 ? "มีพฤติกรรมที่ดีมาก" : "ควรปรับปรุงพฤติกรรม"}
            </p>
          </div>
        </div>
      </div>

      {/* Face scan evidence */}
      {faceScanImageUrl && (
        <div className={compact ? "mt-2.5" : "mt-3"}>
          <p className={`font-bold text-gray-800 dark:text-gray-200 ${compact ? "mb-1.5 text-xs" : "mb-2 text-sm"}`}>
            ภาพยืนยันจากการสแกนใบหน้า
          </p>
          <a
            href={faceScanImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="คลิกเพื่อดูภาพขนาดเต็ม"
            className="block overflow-hidden rounded-xl group relative"
          >
            <img
              src={faceScanImageUrl}
              alt="ภาพยืนยันจากการสแกนใบหน้า"
              className="aspect-video w-full rounded-xl bg-gray-100 object-cover transition-transform duration-300 group-hover:scale-[1.02] dark:bg-[#1e1f21]"
            />
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              ดูภาพเต็ม
            </span>
          </a>
          <p className={`text-gray-400 ${compact ? "mt-1 text-[11px]" : "mt-1 text-xs"}`}>
            {faceConfidence !== null ? `ความมั่นใจในการยืนยันตัวตน ${Math.round(faceConfidence * 100)}%` : "บันทึกจากระบบสแกนใบหน้า"}
          </p>
        </div>
      )}
    </div>
  );
};

export default AttendanceNotificationCard;
