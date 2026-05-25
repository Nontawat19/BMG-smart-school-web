import { FoundUser } from "./types";

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
    parentUserIds: string[]
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
        const stats = user.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
        const score = user.behaviorScore || 100;

        // คำนวณ totalDays รวม 6 สถานะ (เหมือน Gateway)
        const totalDays = (stats.present || 0) + (stats.late || 0) + (stats.absent || 0) + (stats.leave || 0) + (stats.noCheckout || 0) + (stats.officialTravel || 0);

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
                        totalDays === 0 ? 1 : (stats.present || 0),
                        stats.late || 0,
                        stats.absent || 0,
                        stats.leave || 0
                    ],
                    backgroundColor: ['#1DB446', '#FFC107', '#FF5722', '#00BCD4'],
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
        const bubbleBgColor = isLate ? "#fffbeb" : "#f0fdf4";
        const bubbleIconBg = isLate ? "#fbbf24" : "#1db446";
        const bubbleIcon = isLate ? "!" : "✓";
        const bubbleTextColor = isLate ? "#92400e" : "#166534";
        const bubbleMessage = isLate ? "กรุณามาให้ทันเวลาในครั้งถัดไป" : "ทำรายการสำเร็จ";

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
            altText: `รายงานการเข้าเรียน: ${user.name}`,
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
                                    contents: [
                                        {
                                            type: "image",
                                            url: profileUrl,
                                            size: "full",
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
                                                        { type: "text", text: "ไปราชการ", size: "sm", color: "#666666", margin: "md", flex: 4 },
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
                                        { type: "text", text: `${user.name} ${status}แล้วเวลา ${time} น.`, size: "sm", color: bubbleTextColor, weight: "bold", wrap: true },
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

                        // --- ส่วนที่ 4: ข่าวสารจากโรงเรียน ---
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "xl",
                            contents: [
                                { type: "text", text: "ข่าวสารจากโรงเรียน", weight: "bold", size: "sm", color: "#333333" },
                                {
                                    type: "box",
                                    layout: "vertical",
                                    margin: "md",
                                    spacing: "sm",
                                    contents: [
                                        {
                                            type: "box", layout: "horizontal", spacing: "md", alignItems: "center", contents: [
                                                { type: "text", text: "📄", size: "md", flex: 0 },
                                                { type: "text", text: "ใบแจ้งหนี้ค่าเทอม", size: "sm", color: "#444444", flex: 1 },
                                                { type: "text", text: "📑", size: "md", flex: 0, color: "#aaaaaa" }
                                            ]
                                        },
                                        {
                                            type: "box", layout: "horizontal", spacing: "md", alignItems: "center", contents: [
                                                { type: "text", text: "📅", size: "md", flex: 0 },
                                                { type: "text", text: "ประกาศวันหยุดราชการ", size: "sm", color: "#444444", flex: 1 },
                                                { type: "text", text: "📑", size: "md", flex: 0, color: "#aaaaaa" }
                                            ]
                                        },
                                        {
                                            type: "box", layout: "horizontal", spacing: "md", alignItems: "center", contents: [
                                                { type: "text", text: "🖋️", size: "md", flex: 0 },
                                                { type: "text", text: "ใบอนุญาตไปทัศนศึกษา", size: "sm", color: "#444444", flex: 1 },
                                                { type: "text", text: "เซ็นรับรองออนไลน์", size: "xs", color: "#1DB446", weight: "bold", flex: 0 }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        };

        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

        if (!parentUserIds || parentUserIds.length === 0) {
            console.warn("⚠️ ไม่มีรายชื่อผู้รับ LINE User ID (ผู้ปกครอง/ครูประจำชั้น) สำหรับนักเรียนคนนี้ - ยกเลิกการส่งแบบ Broadcast เพื่อความปลอดภัย");
            return;
        }

        // กรองเอาเฉพาะ User ID ที่มีค่าจริง และลบรายการซ้ำออก
        const uniqueRecipients = Array.from(new Set(parentUserIds.filter(id => id && id.trim() !== "")));

        if (uniqueRecipients.length === 0) {
            console.warn("⚠️ ไม่มีรายชื่อผู้รับที่ถูกต้องหลังจากกรองข้อมูล - ยกเลิกการส่ง");
            return;
        }

        const targetUrl = "https://api.line.me/v2/bot/message/multicast";
        const bodyPayload = {
            to: uniqueRecipients,
            messages: [flexMessage]
        };
        console.log(`🎯 ส่งข้อความแบบ Dashboard Multicast ไปยังผู้รับที่ได้รับอนุญาตทั้งหมด ${uniqueRecipients.length} ท่าน`);

        const url = isLocalhost ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

        // ใช้ AbortController สำหรับ timeout (เหมือน Gateway timeout=15)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${lineChannelAccessToken}`
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            console.log(`✅ Dashboard LINE Notification sent successfully for ${user.name}`);
        } else {
            const errorText = await response.text();
            console.error(`❌ Failed to send Dashboard LINE notification: ${response.status} - ${errorText}`);
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error("❌ LINE notification timed out after 15 seconds");
        } else {
            console.error("❌ Error in sendLineAttendanceNotification:", error);
        }
    }
};
