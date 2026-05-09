import React, { useEffect, useRef } from 'react';
import { FoundUser } from './types';

interface AttendanceSpeechProps {
    user?: FoundUser | null;
    actionType?: "checkin" | "checkout" | "checkin_and_checkout" | null;
    timestamp: number;
    selectedVoiceURI?: string | null;
    enabled?: boolean;
    status?: 'success' | 'error';
}

const AttendanceSpeech: React.FC<AttendanceSpeechProps> = ({
    user,
    actionType,
    timestamp,
    selectedVoiceURI,
    enabled = true,
    status = 'success'
}) => {
    const lastProcessedTimestamp = useRef<number>(0);

    useEffect(() => {
        if (!enabled || timestamp === lastProcessedTimestamp.current) return;

        lastProcessedTimestamp.current = timestamp;

        const speak = () => {
            // ยกเลิกการพูดเดิมที่ค้างอยู่ (ถ้ามี)
            window.speechSynthesis.cancel();

            let message = "";

            if (status === 'error') {
                message = "ไม่ผ่านค่ะ";
            } else {
                message = "ผ่านค่ะ";
            }

            const utterance = new SpeechSynthesisUtterance(message);
            utterance.lang = 'th-TH';
            utterance.rate = 1.0; // โทนปกติ ทางการ
            utterance.pitch = 1.0; // โทนปกติ ทางการ

            // ดึงรายชื่อเสียงทั้งหมด
            const voices = window.speechSynthesis.getVoices();
            const thaiVoices = voices.filter(v => v.lang.startsWith('th'));

            // 1. ลองหาเสียงตาม URI ที่ส่งมา (ถ้ามี)
            let selectedVoice = null;
            if (selectedVoiceURI) {
                selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
            }

            // Keyword ที่ระบุว่าเป็นเสียงผู้หญิง
            const femaleKeywords = ['kanru', 'pattara', 'kanya', 'narisa', 'female', 'เคนรุ', 'ภัทรา', 'กัญญา', 'นริศา'];

            // 2. ถ้าไม่มีหรือหาไม่เจอตาม URI ให้ลองหาเสียงผู้หญิงจากคีย์เวิร์ด
            if (!selectedVoice) {
                selectedVoice = thaiVoices.find(v => {
                    const name = v.name.toLowerCase();
                    return femaleKeywords.some(kw => name.includes(kw)) && !name.includes('male');
                });
            }

            // 3. ถ้าไม่เจอ ลองหาเสียง Google (มักเป็นผู้หญิง)
            if (!selectedVoice) {
                selectedVoice = thaiVoices.find(v => v.name.toLowerCase().includes('google'));
            }

            // 4. สุดท้ายเลือกเสียงแรกที่มี
            if (!selectedVoice) {
                selectedVoice = thaiVoices[0];
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            window.speechSynthesis.speak(utterance);
        };

        // Handle initial voices loading
        if (window.speechSynthesis.getVoices().length === 0) {
            const handleVoicesChanged = () => {
                speak();
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            };
            window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        } else {
            speak();
        }
    }, [user, actionType, timestamp, enabled, selectedVoiceURI, status]);

    return null;
};

export default AttendanceSpeech;
