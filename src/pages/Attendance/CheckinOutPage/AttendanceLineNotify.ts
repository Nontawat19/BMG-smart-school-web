import { FoundUser } from "./types";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getTeacherRoleDisplay } from "./utils";

export const sendTeacherLineAttendanceNotification = async (
    user: FoundUser,
    status: string,
    time: string,
    config: any,
    recipientUserIds: string[],
    actionType: string = "checkin"
) => {
    if (!config) return;
    const { lineChannelAccessToken, enableNotification } = config;
    const isEnabled = enableNotification === undefined ? true : enableNotification;
    if (!isEnabled || !lineChannelAccessToken) return;

    const uniqueRecipients = Array.from(new Set(
        (recipientUserIds || []).map((id: string) => id?.trim()).filter(isLineUserId)
    ));
    if (uniqueRecipients.length === 0) return;

    try {
        const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
        const isLate = status === "สาย";
        const isLeave = status === "ลา" || (status || "").startsWith("ลา");
        const isAbsent = status === "ขาด";

        let bubbleBg = "#f0fdf4", bubbleIconBg = "#1db446", bubbleIcon = "✓", bubbleTextColor = "#166534";
        if (isLate)        { bubbleBg = "#fffbeb"; bubbleIconBg = "#fbbf24"; bubbleIcon = "!"; bubbleTextColor = "#92400e"; }
        else if (isLeave)  { bubbleBg = "#eff6ff"; bubbleIconBg = "#3b82f6"; bubbleIcon = "i"; bubbleTextColor = "#1e40af"; }
        else if (isAbsent) { bubbleBg = "#fef2f2"; bubbleIconBg = "#ef4444"; bubbleIcon = "x"; bubbleTextColor = "#7f1d1d"; }

        const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
        const reportTitle = (isCheckout || status === "กลับก่อน") ? "รายงานการกลับบ้าน (ครู)" : "รายงานการมาทำงาน (ครู)";
        const bubbleMessage = isCheckout ? "คุณครูลงเวลากลับแล้ว" : (isLate ? "กรุณามาให้ทันเวลาในครั้งถัดไป" : "ทำรายการสำเร็จ");

        const profileUrl = (user.profileImageUrl && user.profileImageUrl.startsWith("https://"))
            ? user.profileImageUrl
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4F46E5&color=fff&size=200`;

        // สรุปสถิติการมาทำงานภาคเรียนนี้ + กราฟวงกลม (เหมือนของนักเรียน)
        const rawStats = user.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
        const stats = {
            present: Math.max(0, rawStats.present || 0),
            late: Math.max(0, rawStats.late || 0),
            leave: Math.max(0, rawStats.leave || 0),
            absent: Math.max(0, rawStats.absent || 0),
            noCheckout: Math.max(0, rawStats.noCheckout || 0),
            officialTravel: Math.max(0, rawStats.officialTravel || 0),
        };
        const totalDays = stats.present + stats.late + stats.absent + stats.leave + stats.noCheckout + stats.officialTravel;

        const chartConfig = {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [
                        totalDays === 0 ? 1 : stats.present,
                        stats.late,
                        stats.absent,
                        stats.leave,
                        stats.noCheckout,
                        stats.officialTravel
                    ],
                    backgroundColor: ['#1DB446', '#FFC107', '#FF5722', '#00BCD4', '#FF9800', '#9C27B0'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                plugins: {
                    datalabels: { display: false },
                    doughnutlabel: {
                        labels: [
                            { text: String(totalDays), font: { size: 26, weight: 'bold', family: 'sans-serif' }, color: '#333333' },
                            { text: 'วัน', font: { size: 14, family: 'sans-serif' }, color: '#666666' }
                        ]
                    }
                }
            }
        };
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=200&h=200`;

        // ภาพยืนยันจากการสแกนใบหน้า (เหมือนของนักเรียน) — แนบเฉพาะตอนลงเวลาด้วยการสแกนใบหน้า
        const faceScanImageUrl = user.scanMethod === "สแกนใบหน้า" &&
            user.faceScanImageUrl &&
            user.faceScanImageUrl.startsWith("https://")
            ? user.faceScanImageUrl
            : "";
        const faceScanEvidenceSection = faceScanImageUrl ? {
            type: "box",
            layout: "vertical",
            margin: "xl",
            spacing: "sm",
            contents: [
                { type: "text", text: "ภาพยืนยันจากการสแกนใบหน้า", weight: "bold", size: "sm", color: "#333333" },
                {
                    type: "image",
                    url: faceScanImageUrl,
                    size: "full",
                    aspectRatio: "16:9",
                    aspectMode: "cover",
                    backgroundColor: "#f3f4f6"
                },
                {
                    type: "text",
                    text: user.faceConfidence !== undefined
                        ? `ความมั่นใจในการยืนยันตัวตน ${Math.round(user.faceConfidence * 100)}%`
                        : "บันทึกจากระบบสแกนใบหน้า",
                    size: "xs",
                    color: "#777777"
                }
            ]
        } : null;

        const flexMessage = {
            type: "flex",
            altText: `${reportTitle}: ${user.name}`,
            contents: {
                type: "bubble",
                size: "giga",
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    backgroundColor: "#ffffff",
                    contents: [
                        // --- ส่วนหัว: ข้อมูลครู ---
                        {
                            type: "box", layout: "horizontal", alignItems: "center",
                            contents: [
                                {
                                    type: "box", layout: "vertical",
                                    width: "70px", height: "70px", cornerRadius: "100px",
                                    contents: [{ type: "image", url: profileUrl, size: "full", aspectMode: "cover" }]
                                },
                                {
                                    type: "box", layout: "vertical", margin: "lg",
                                    contents: [
                                        { type: "text", text: user.name, weight: "bold", size: "xl", color: "#111111" },
                                        { type: "text", text: `${getTeacherRoleDisplay(user)}${user.displayId ? ` • ${user.displayId}` : ""}`, size: "sm", color: "#666666", margin: "xs" }
                                    ]
                                }
                            ]
                        },

                        // --- สรุปสถิติการมาทำงานภาคเรียนนี้ (กราฟ + สถิติ 6 สถานะ) ---
                        {
                            type: "box", layout: "vertical", paddingAll: "15px",
                            backgroundColor: "#fcfcfc", cornerRadius: "15px",
                            borderWidth: "1px", borderColor: "#eeeeee", margin: "xl",
                            contents: [
                                { type: "text", text: "สถานะการมาทำงาน ภาคเรียนนี้", weight: "bold", size: "md", color: "#333333" },
                                {
                                    type: "box", layout: "horizontal", margin: "lg", alignItems: "center",
                                    contents: [
                                        {
                                            type: "box", layout: "vertical", flex: 1, spacing: "sm",
                                            contents: [
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🟢", size: "xs", flex: 0 },
                                                    { type: "text", text: "มาทำงาน", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.present || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]},
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🟡", size: "xs", flex: 0 },
                                                    { type: "text", text: "สาย", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.late || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]},
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🔴", size: "xs", flex: 0 },
                                                    { type: "text", text: "ขาด", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.absent || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]},
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🔵", size: "xs", flex: 0 },
                                                    { type: "text", text: "ลา", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.leave || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]},
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🟠", size: "xs", flex: 0 },
                                                    { type: "text", text: "ไม่ลงเวลาออก", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.noCheckout || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]},
                                                { type: "box", layout: "horizontal", contents: [
                                                    { type: "text", text: "🟣", size: "xs", flex: 0 },
                                                    { type: "text", text: "ไปราชการ", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                    { type: "text", text: String(stats.officialTravel || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                ]}
                                            ]
                                        },
                                        {
                                            type: "box", layout: "vertical", width: "110px", height: "110px",
                                            contents: [{ type: "image", url: chartUrl, size: "full", aspectMode: "fit" }]
                                        }
                                    ]
                                }
                            ]
                        },

                        // --- สถานะปัจจุบัน (Bubble) ---
                        {
                            type: "box", layout: "horizontal", margin: "xl",
                            backgroundColor: bubbleBg, cornerRadius: "12px",
                            paddingAll: "12px", alignItems: "center",
                            contents: [
                                {
                                    type: "box", layout: "vertical",
                                    width: "30px", height: "30px",
                                    backgroundColor: bubbleIconBg, cornerRadius: "100px",
                                    alignItems: "center", justifyContent: "center",
                                    contents: [{ type: "text", text: bubbleIcon, color: "#ffffff", size: "sm", weight: "bold", align: "center" }]
                                },
                                {
                                    type: "box", layout: "vertical", margin: "md",
                                    contents: [
                                        { type: "text", text: `${user.name} ${displayStatusText}แล้วเวลา ${time} น.`, size: "sm", color: bubbleTextColor, weight: "bold", wrap: true },
                                        { type: "text", text: bubbleMessage, size: "xs", color: bubbleTextColor, margin: "xs" }
                                    ]
                                }
                            ]
                        },

                        ...(faceScanEvidenceSection ? [faceScanEvidenceSection] : [])
                    ]
                }
            }
        };

        const functions = getFunctions(undefined, "us-central1");
        const sendLineMulticast = httpsCallable(functions, "sendLineMulticast");
        await sendLineMulticast({ lineChannelAccessToken, recipientUserIds: uniqueRecipients, messages: [flexMessage] });
        console.log(`✅ Teacher LINE Notification sent for ${user.name}`);
    } catch (error) {
        console.error("❌ Error in sendTeacherLineAttendanceNotification:", error);
    }
};

const isLineUserId = (value: string) => /^U[0-9a-f]{32}$/i.test(value.trim());
const maskLineRecipient = (value: string) => {
    const text = value.trim();
    if (text.length <= 10) return text;
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

/**
 * ฟังก์ชันสำหรับส่งแจ้งเตือน LINE OA เมื่อนักเรียนลงเวลาเข้า/ออก
 * ปรับปรุง UI ให้เป็นแบบ Dashboard Premium (ตรงกับ Gateway notifier.py 100%)
 * อ้างอิง: https://github.com/Nontawat19/gateway/blob/main/notifier.py
 */
export const sendLineAttendanceNotification = async (
    user: FoundUser,
    status: string,
    time: string,
    teacherConfig: any,
    parentUserIds: string[],
    actionType: string = "checkin"
) => {
    console.log("🚀 เริ่มต้นกระบวนการส่ง LINE Notify (Dashboard Redesign)");

    if (!teacherConfig) {
        console.warn("❌ ไม่พบข้อมูลการตั้งค่า LINE OA");
        return;
    }

    const { lineChannelAccessToken, enableNotification } = teacherConfig;
    const isEnabled = enableNotification === undefined ? true : enableNotification;

    if (!isEnabled || !lineChannelAccessToken) {
        console.warn("❌ ระบบแจ้งเตือน LINE ถูกปิดอยู่ หรือไม่มี Access Token");
        return;
    }

    try {
        const rawStats = user.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
        // Guard against negative values caused by Firestore increment(-1) going below 0 due to data inconsistency
        const stats = {
            present: Math.max(0, rawStats.present || 0),
            late: Math.max(0, rawStats.late || 0),
            leave: Math.max(0, rawStats.leave || 0),
            absent: Math.max(0, rawStats.absent || 0),
            noCheckout: Math.max(0, rawStats.noCheckout || 0),
            officialTravel: Math.max(0, rawStats.officialTravel || 0),
        };
        const score = user.behaviorScore ?? 100;

        // คำนวณ totalDays รวม 6 สถานะ (เหมือน Gateway)
        const totalDays = stats.present + stats.late + stats.absent + stats.leave + stats.noCheckout + stats.officialTravel;

        // LINE ต้องการ HTTPS URL ที่เข้าถึงได้สาธารณะ (เหมือน Gateway)
        const profileUrl = (user.profileImageUrl && user.profileImageUrl.startsWith('https://'))
            ? user.profileImageUrl
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0D8ABC&color=fff&size=200`;

        console.log(`🖼️ Profile URL: ${profileUrl.substring(0, 80)}...`);

        // สร้างกราฟวงกลม (Donut Chart) ผ่าน QuickChart.io (เหมือน Gateway)
        const chartConfig = {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [
                        totalDays === 0 ? 1 : stats.present,
                        stats.late,
                        stats.absent,
                        stats.leave,
                        stats.noCheckout,
                        stats.officialTravel
                    ],
                    backgroundColor: ['#1DB446', '#FFC107', '#FF5722', '#00BCD4', '#FF9800', '#9C27B0'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                plugins: {
                    datalabels: { display: false },
                    doughnutlabel: {
                        labels: [
                            { text: String(totalDays), font: { size: 26, weight: 'bold', family: 'sans-serif' }, color: '#333333' },
                            { text: 'วัน', font: { size: 14, family: 'sans-serif' }, color: '#666666' }
                        ]
                    }
                }
            }
        };
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=200&h=200`;

        // Conditional colors ตามสถานะ (เหมือน Gateway)
        const isLate = status === "สาย";
        const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
        const bubbleBgColor = isLate ? "#fffbeb" : "#f0fdf4";
        const bubbleIconBg = isLate ? "#fbbf24" : "#1db446";
        const bubbleIcon = isLate ? "!" : "✓";
        const bubbleTextColor = isLate ? "#92400e" : "#166534";
        const bubbleMessage = isCheckout ? "บุตรหลานของท่านกำลังเดินทางกลับ" : (isLate ? "กรุณามาให้ทันเวลาในครั้งถัดไป" : "ทำรายการสำเร็จ");
        const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
        const reportTitle = (isCheckout || status === "กลับก่อน") ? "รายงานการกลับบ้าน" : "รายงานการมาเรียน";
        const faceScanImageUrl = user.scanMethod === "สแกนใบหน้า" &&
            user.faceScanImageUrl &&
            user.faceScanImageUrl.startsWith("https://")
            ? user.faceScanImageUrl
            : "";
        const faceScanEvidenceSection = faceScanImageUrl ? {
            type: "box",
            layout: "vertical",
            margin: "xl",
            spacing: "sm",
            contents: [
                { type: "text", text: "ภาพยืนยันจากการสแกนใบหน้า", weight: "bold", size: "sm", color: "#333333" },
                {
                    type: "image",
                    url: faceScanImageUrl,
                    size: "full",
                    aspectRatio: "16:9",
                    aspectMode: "cover",
                    backgroundColor: "#f3f4f6"
                },
                {
                    type: "text",
                    text: user.faceConfidence !== undefined
                        ? `ความมั่นใจในการยืนยันตัวตน ${Math.round(user.faceConfidence * 100)}%`
                        : "บันทึกจากระบบสแกนใบหน้า",
                    size: "xs",
                    color: "#777777"
                }
            ]
        } : null;

        // สร้างชื่อแสดงผลสำหรับ grade (เหมือน Gateway: ม.3/4)
        let gradeDisplay = user.grade || "-";
        if (gradeDisplay !== "-" && user.room) {
            let g = gradeDisplay.trim();
            let formattedGrade = g;
            if (g.startsWith('ม.')) formattedGrade = `ม.${g.substring(2).trim()}`;
            else if (g.startsWith('ป.')) formattedGrade = `ป.${g.substring(2).trim()}`;
            
            gradeDisplay = `${formattedGrade}/${user.room}`;
        } else if (gradeDisplay !== "-" && !gradeDisplay.includes('/')) {
            // กรณีไม่มีเลขห้อง แต่ต้องการ format ให้สวยงาม
            let g = gradeDisplay.trim();
            if (g.startsWith('ม.')) gradeDisplay = `ม.${g.substring(2).trim()}`;
            else if (g.startsWith('ป.')) gradeDisplay = `ป.${g.substring(2).trim()}`;
        }

        const flexMessage = {
            type: "flex",
            altText: `${reportTitle}: ${user.name}`,
            contents: {
                type: "bubble",
                size: "giga",
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    backgroundColor: "#ffffff",
                    contents: [
                        // --- ส่วนหัว: ข้อมูลนักเรียน ---
                        {
                            type: "box",
                            layout: "horizontal",
                            alignItems: "center",
                            contents: [
                                {
                                    type: "box",
                                    layout: "vertical",
                                    width: "70px",
                                    height: "70px",
                                    cornerRadius: "100px",
                                    paddingAll: "0px",
                                    contents: [
                                        {
                                            type: "image",
                                            url: profileUrl,
                                            position: "absolute",
                                            offsetTop: "0px",
                                            offsetStart: "0px",
                                            size: "70px",
                                            aspectRatio: "7:9",
                                            aspectMode: "cover"
                                        }
                                    ]
                                },
                                {
                                    type: "box",
                                    layout: "vertical",
                                    margin: "lg",
                                    contents: [
                                        { type: "text", text: user.name, weight: "bold", size: "xl", color: "#111111" },
                                        { type: "text", text: `${gradeDisplay} • ${user.displayId}`, size: "sm", color: "#666666", margin: "xs" }
                                    ]
                                }
                            ]
                        },

                        // --- ส่วนที่ 1: สถานะการเข้าเรียน (กราฟ + สถิติ 6 สถานะ) ---
                        {
                            type: "box",
                            layout: "vertical",
                            paddingAll: "15px",
                            backgroundColor: "#fcfcfc",
                            cornerRadius: "15px",
                            borderWidth: "1px",
                            borderColor: "#eeeeee",
                            margin: "xl",
                            contents: [
                                { type: "text", text: "สถานะการเข้าเรียน ภาคเรียนนี้", weight: "bold", size: "md", color: "#333333" },
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    margin: "lg",
                                    alignItems: "center",
                                    contents: [
                                        // รายการสถิติ 6 สถานะ (เหมือน Gateway)
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            flex: 1,
                                            spacing: "sm",
                                            contents: [
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🟢", size: "xs", flex: 0 },
                                                        { type: "text", text: "มาเรียน", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.present || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                },
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🟡", size: "xs", flex: 0 },
                                                        { type: "text", text: "สาย", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.late || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                },
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🔴", size: "xs", flex: 0 },
                                                        { type: "text", text: "ขาด", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.absent || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                },
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🔵", size: "xs", flex: 0 },
                                                        { type: "text", text: "ลา", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.leave || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                },
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🟠", size: "xs", flex: 0 },
                                                        { type: "text", text: "ไม่ลงเวลาออก", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.noCheckout || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                },
                                                {
                                                    type: "box", layout: "horizontal", contents: [
                                                        { type: "text", text: "🟣", size: "xs", flex: 0 },
                                                        { type: "text", text: "ไปร่วมกิจกรรม", size: "sm", color: "#666666", margin: "md", flex: 4 },
                                                        { type: "text", text: String(stats.officialTravel || 0), size: "sm", weight: "bold", align: "end", flex: 2 }
                                                    ]
                                                }
                                            ]
                                        },
                                        // กราฟ Donut
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            width: "110px",
                                            height: "110px",
                                            contents: [
                                                {
                                                    type: "image",
                                                    url: chartUrl,
                                                    size: "full",
                                                    aspectMode: "fit"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },

                        // --- ส่วนที่ 2: สถานะปัจจุบัน (Bubble) - Conditional styling เหมือน Gateway ---
                        {
                            type: "box",
                            layout: "horizontal",
                            margin: "xl",
                            backgroundColor: bubbleBgColor,
                            cornerRadius: "12px",
                            paddingAll: "12px",
                            alignItems: "center",
                            contents: [
                                {
                                    type: "box",
                                    layout: "vertical",
                                    width: "30px",
                                    height: "30px",
                                    backgroundColor: bubbleIconBg,
                                    cornerRadius: "100px",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    contents: [{ type: "text", text: bubbleIcon, color: "#ffffff", size: "sm", weight: "bold", align: "center" }]
                                },
                                {
                                    type: "box",
                                    layout: "vertical",
                                    margin: "md",
                                    contents: [
                                        { type: "text", text: `${user.name} ${displayStatusText}แล้วเวลา ${time} น.`, size: "sm", color: bubbleTextColor, weight: "bold", wrap: true },
                                        { type: "text", text: bubbleMessage, size: "xs", color: bubbleTextColor, margin: "xs" }
                                    ]
                                }
                            ]
                        },

                        // --- ส่วนที่ 3: คะแนนพฤติกรรม - Dynamic text เหมือน Gateway ---
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "xl",
                            paddingAll: "15px",
                            backgroundColor: "#ffffff",
                            cornerRadius: "15px",
                            borderWidth: "1px",
                            borderColor: "#eeeeee",
                            contents: [
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        { type: "text", text: "คะแนนพฤติกรรม ภาคเรียนนี้", weight: "bold", size: "sm", color: "#333333", flex: 4 },
                                        { type: "text", text: "ดูย้อนหลัง", size: "xs", color: "#666666", align: "end", flex: 2 }
                                    ]
                                },
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    margin: "md",
                                    contents: [
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            flex: 1,
                                            contents: [
                                                { type: "text", text: `${score}/100`, weight: "bold", size: "xxl", color: score >= 80 ? "#1DB446" : "#EAB308" },
                                                { type: "text", text: score >= 80 ? "มีพฤติกรรมที่ดีมาก" : "ควรปรับปรุงพฤติกรรม", size: "xs", color: "#888888", margin: "xs" }
                                            ]
                                        },
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            flex: 1,
                                            spacing: "xs",
                                            contents: [
                                                { type: "text", text: "ยอดใช้จ่าย: - บาท", size: "xs", color: "#666666", align: "end" },
                                                { type: "text", text: "ยอดเงินคงเหลือ: - บาท", size: "xs", color: "#666666", align: "end" }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },

                        ...(faceScanEvidenceSection ? [faceScanEvidenceSection] : [])
                    ]
                }
            }
        };

        if (!parentUserIds || parentUserIds.length === 0) {
            console.warn("⚠️ ไม่มีรายชื่อผู้รับ LINE User ID (ผู้ปกครอง/ครูประจำชั้น) สำหรับนักเรียนคนนี้ - ยกเลิกการส่งแบบ Broadcast เพื่อความปลอดภัย");
            return;
        }

        const rawRecipients = Array.from(new Set(parentUserIds.map(id => id?.trim()).filter(Boolean))) as string[];
        const invalidRecipients = rawRecipients.filter(id => !isLineUserId(id));
        if (invalidRecipients.length > 0) {
            console.warn("⚠️ พบ LINE User ID ไม่ถูกต้อง ระบบจะไม่ส่งให้รายการเหล่านี้:", invalidRecipients.map(maskLineRecipient));
        }

        // กรองเอาเฉพาะ LINE User ID จริงที่ขึ้นต้นด้วย U และลบรายการซ้ำออก
        const uniqueRecipients = rawRecipients.filter(isLineUserId);

        if (uniqueRecipients.length === 0) {
            console.warn("⚠️ ไม่มีรายชื่อผู้รับที่ถูกต้องหลังจากกรองข้อมูล - ยกเลิกการส่ง");
            return;
        }

        console.log(`🎯 ส่งข้อความแบบ Dashboard Multicast ไปยังผู้รับที่ได้รับอนุญาตทั้งหมด ${uniqueRecipients.length} ท่าน`);
        console.log("📨 กำลังส่ง LINE ผ่าน Cloud Function sendLineMulticast...");

        const functions = getFunctions(undefined, "us-central1");
        const sendLineMulticast = httpsCallable(functions, "sendLineMulticast");
        const result = await sendLineMulticast({
            lineChannelAccessToken,
            recipientUserIds: uniqueRecipients,
            messages: [flexMessage],
        });

        console.log(`✅ Dashboard LINE Notification sent successfully for ${user.name}`, result.data);
    } catch (error: any) {
        console.error("❌ Error in sendLineAttendanceNotification:", error);
    }
};
