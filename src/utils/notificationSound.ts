// เสียงแจ้งเตือนแบบสังเคราะห์ด้วย Web Audio API (ไม่ใช่ไฟล์เสียงที่ดาวน์โหลดมา) — เลือกทำแบบนี้เพราะ
// ไม่มีปัญหาลิขสิทธิ์เลย (โค้ดสร้างเสียงเอง ไม่ใช่ไฟล์ของคนอื่น) ใช้เชิงพาณิชย์ได้ 100% แน่นอน
// ต่างจากไฟล์เสียงฟรีตามเว็บที่ต้องเช็คเงื่อนไขสัญญาอนุญาตเป็นรายไฟล์ไป
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
};

export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // เสียง "ติ้ง" สองโน้ตไล่ระดับขึ้น (เหมือนเสียงแจ้งเตือนทั่วไปของแอปแชท) สั้นๆ ไม่รบกวน
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1318.5, start: 0.1, duration: 0.18 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(0.2, now + start + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.02);
    });
  } catch (error) {
    console.error("Error playing notification sound:", error);
  }
};
