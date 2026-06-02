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
    const speechQueue = useRef<{ message: string; timestamp: number }[]>([]);
    const isSpeaking = useRef<boolean>(false);

    const processQueue = () => {
        if (!enabled) {
            speechQueue.current = [];
            isSpeaking.current = false;
            return;
        }

        if (isSpeaking.current || speechQueue.current.length === 0) {
            return;
        }

        const nextSpeech = speechQueue.current.shift();
        if (!nextSpeech) return;

        isSpeaking.current = true;

        const utterance = new SpeechSynthesisUtterance(nextSpeech.message);
        utterance.lang = 'th-TH';
        utterance.rate = 0.95; // Slightly slower for clear name pronunciation
        utterance.pitch = 1.0;

        // Get voices
        const voices = window.speechSynthesis.getVoices();
        const thaiVoices = voices.filter(v => v.lang.startsWith('th'));

        let selectedVoice = null;
        if (selectedVoiceURI) {
            selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        }

        const femaleKeywords = ['kanru', 'pattara', 'kanya', 'narisa', 'female', 'เคนรุ', 'ภัทรา', 'กัญญา', 'นริศา'];

        if (!selectedVoice) {
            selectedVoice = thaiVoices.find(v => {
                const name = v.name.toLowerCase();
                return femaleKeywords.some(kw => name.includes(kw)) && !name.includes('male');
            });
        }

        if (!selectedVoice) {
            selectedVoice = thaiVoices.find(v => v.name.toLowerCase().includes('google'));
        }

        if (!selectedVoice) {
            selectedVoice = thaiVoices[0];
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.onend = () => {
            isSpeaking.current = false;
            // Short delay between speech announcements for natural spacing
            setTimeout(() => {
                processQueue();
            }, 300);
        };

        utterance.onerror = (e) => {
            console.error("SpeechSynthesisUtterance error:", e);
            isSpeaking.current = false;
            processQueue();
        };

        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (!enabled || timestamp === 0 || timestamp === lastProcessedTimestamp.current) return;

        lastProcessedTimestamp.current = timestamp;

        let message = "";
        if (status === 'error') {
            message = "ไม่ผ่านค่ะ";
        } else {
            const nameToSpeak = user ? user.name : '';
            message = nameToSpeak ? `${nameToSpeak} ผ่านค่ะ` : "ผ่านค่ะ";
        }

        // Add to queue
        speechQueue.current.push({ message, timestamp });
        
        // Try processing queue
        processQueue();
    }, [user, actionType, timestamp, enabled, status]);

    // Handle initial voices loading
    useEffect(() => {
        if (!enabled) return;

        const handleVoicesChanged = () => {
            processQueue();
        };

        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        }

        return () => {
            window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        };
    }, [enabled]);

    // Cleanup speech on unmount
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    return null;
};

export default AttendanceSpeech;
