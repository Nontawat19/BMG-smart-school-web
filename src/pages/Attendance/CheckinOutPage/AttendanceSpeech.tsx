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

const SUCCESS_SPEECH_DELAY_MS = 700;
const BRIGHT_FEMALE_VOICE_RATE = 1.08;
const BRIGHT_FEMALE_VOICE_PITCH = 1.26;

export const getPreferredThaiVoice = (voices: SpeechSynthesisVoice[]) => {
    const thaiVoices = voices.filter(v => v.lang.toLowerCase().startsWith('th'));
    const rankedKeywords = [
        'google',
        'narisa',
        'kanya',
        'pattara',
        'kanru',
        'premium',
        'enhanced',
        'natural',
        'นริศา',
        'กัญญา',
        'ภัทรา',
        'เคนรุ',
    ];

    return [...thaiVoices].sort((a, b) => {
        const score = (voice: SpeechSynthesisVoice) => {
            const name = voice.name.toLowerCase();
            const keywordScore = rankedKeywords.reduce((sum, keyword, index) => (
                name.includes(keyword) ? sum + (rankedKeywords.length - index) : sum
            ), 0);
            const malePenalty = name.includes('male') || name.includes('ชาย') ? 20 : 0;
            return keywordScore - malePenalty;
        };

        return score(b) - score(a);
    })[0] || null;
};

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
    const speechDelayTimer = useRef<number | null>(null);

    const processQueue = () => {
        if (!enabled) {
            if (speechDelayTimer.current !== null) {
                window.clearTimeout(speechDelayTimer.current);
                speechDelayTimer.current = null;
            }
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
        utterance.rate = BRIGHT_FEMALE_VOICE_RATE;
        utterance.pitch = BRIGHT_FEMALE_VOICE_PITCH;

        // Get voices
        const voices = window.speechSynthesis.getVoices();

        let selectedVoice = null;
        if (selectedVoiceURI) {
            selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        }

        if (!selectedVoice) {
            selectedVoice = getPreferredThaiVoice(voices);
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
            if (e.error !== 'canceled') {
                console.error("SpeechSynthesisUtterance error:", e);
            }
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
            message = "ผ่านค่ะ";
        }

        if (speechDelayTimer.current !== null) {
            window.clearTimeout(speechDelayTimer.current);
            speechDelayTimer.current = null;
        }
        window.speechSynthesis.cancel();
        isSpeaking.current = false;
        speechQueue.current = [];
        speechQueue.current.push({ message, timestamp });

        if (status === 'success') {
            speechDelayTimer.current = window.setTimeout(() => {
                speechDelayTimer.current = null;
                processQueue();
            }, SUCCESS_SPEECH_DELAY_MS);
            return;
        }

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
            if (speechDelayTimer.current !== null) {
                window.clearTimeout(speechDelayTimer.current);
            }
            window.speechSynthesis.cancel();
        };
    }, []);

    return null;
};

export default AttendanceSpeech;
