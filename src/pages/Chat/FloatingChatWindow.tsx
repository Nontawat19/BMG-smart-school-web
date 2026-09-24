import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, ExternalLink, FileText, MessageCircle, Minus, Paperclip, Pencil, Plus, Reply, School, Send, Smile, Sticker as StickerIcon, UserPlus, UsersRound, X } from "lucide-react";
import { useChatMessages, ChatMessage } from "./useChatMessages";
import StickerPicker from "./StickerPicker";
import GifPicker from "./GifPicker";
import EmojiPicker from "./EmojiPicker";
import DeptChatMemberPicker from "./DeptChatMemberPicker";
import CameraCapture from "./CameraCapture";
import InternalDocumentPickerModal, { InternalSystemDocument } from "./InternalDocumentPickerModal";
import { stickerFileUrl } from "./stickerConstants";
import { GifResult } from "./giphy";
import AttendanceNotificationCard from "@/pages/Notifications/AttendanceNotificationCard";
import { formatChatMessageDateTime, getReplyPreviewText, SCHOOL_CHAT_ROOM_ID } from "./chatConstants";

interface Props {
  roomId: string;
  minimized: boolean;
  offsetRight: number;
  onClose: () => void;
  onToggleMinimize: () => void;
}

/**
 * หน้าต่างแชทลอยตัวสไตล์ Facebook Messenger — ลอยมุมขวาล่าง ย่อ/ปิดได้ ไม่หายไปตอนเปลี่ยนหน้า
 * เพราะ FloatingChatManager (คนเรียกคอมโพเนนต์นี้) mount อยู่ที่ระดับ App.tsx นอก <Routes>
 */
const FloatingChatWindow: React.FC<Props> = ({ roomId, minimized, offsetRight, onClose, onToggleMinimize }) => {
  const navigate = useNavigate();
  const { messages, sendMessage, sendSticker, sendGif, sendImage, sendDocument, isSending, isMine: chatIsMine, getMessageReadStatus, title, otherPartyName, otherPartyPhotoUrl, groupMemberCount, onlineTeacherCount, totalTeacherCount, isOtherPartyOnline, isDeptMember, schoolId, roomType, roomStatus, updateRoomTitle } = useChatMessages(roomId, !minimized);
  const isSchoolRoom = roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID;
  const isOneOnOneRoom = roomType === "parent" || roomType === "student-direct" || roomType === "student-homeroom";
  const isGroupRoom = roomType === "group";
  const isDeptRoom = roomType === "department";
  const canEditTitle = roomId === SCHOOL_CHAT_ROOM_ID || isGroupRoom;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [text, setText] = useState("");
  const [activePicker, setActivePicker] = useState<"sticker" | "gif" | "emoji" | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${Math.max(nextHeight, 28)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);
  const isGatedRoom = roomType === "student-direct";
  const isPending = isGatedRoom && roomStatus === "pending";
  const isRejected = isGatedRoom && roomStatus === "rejected";
  const notYetDeptMember = isDeptRoom && isDeptMember === false;
  const canChat = (!isGatedRoom || roomStatus === "approved") && !notYetDeptMember && roomType !== "staff-attendance";

  const handleSaveTitle = async () => {
    if (!editTitle.trim()) return;
    await updateRoomTitle(editTitle);
    setIsEditingTitle(false);
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const prevMessagesCountRef = useRef(0);

  // รีเซ็ตสถานะโหลดครั้งแรกเมื่อเปลี่ยนห้องแชท
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesCountRef.current = 0;
  }, [roomId]);

  // เมื่อเปิดหรือขยายหน้าต่างแชท ให้เลื่อนลงล่างสุดทันทีโดยไม่ให้มีแอนิเมชันวิ่งจากบนลงล่าง
  useEffect(() => {
    if (!minimized && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [minimized]);

  // จัดการการเลื่อนข้อความ:
  // - โหลดครั้งแรกตอนเข้าเว็บ / เปลี่ยนหน้า: ข้ามไปล่างสุดทันที (Instant - ไม่มีการเลื่อนวิ่งผ่านตา)
  // - เมื่อมีข้อความใหม่เข้ามาจริง: ค่อยเลื่อนแบบ smooth scroll เฉพาะภายในกล่องแชท (ไม่รบกวนหน้าเว็บ)
  useEffect(() => {
    if (minimized || messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isInitialLoadRef.current) {
      container.scrollTop = container.scrollHeight;
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight;
      });
      isInitialLoadRef.current = false;
      prevMessagesCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessagesCountRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      prevMessagesCountRef.current = messages.length;
    }
  }, [messages, minimized]);

  useEffect(() => {
    if (minimized) {
      setActivePicker(null);
      setReplyingTo(null);
      setIsEditingTitle(false);
    }
  }, [minimized]);

  const handleStartReply = (msg: ChatMessage) => {
    setReplyingTo(msg);
    setActivePicker(null);
    setTimeout(() => textareaRef.current?.focus(), 60);
  };

  const scrollToMessage = (targetId?: string) => {
    if (!targetId) return;
    const el = document.getElementById(`chat-msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-400", "rounded-2xl", "transition-all", "duration-500");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-indigo-400");
      }, 1500);
    }
  };

  const getReplyPayload = () => {
    if (!replyingTo) return null;
    return {
      id: replyingTo.id,
      senderName: (chatIsMine(replyingTo) ? "คุณ" : replyingTo.senderName) || "ผู้ใช้งาน",
      text: getReplyPreviewText(replyingTo) || "ข้อความ",
      type: replyingTo.type || "text",
    };
  };

  const handleSend = () => {
    if (!text.trim() || isSending) return;
    sendMessage(text.trim(), getReplyPayload());
    setText("");
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePickSticker = (stickerId: string) => {
    sendSticker(stickerId, getReplyPayload());
    setActivePicker(null);
    setReplyingTo(null);
  };

  const handlePickGif = (gif: GifResult) => {
    sendGif(gif.gifUrl, getReplyPayload());
    setActivePicker(null);
    setReplyingTo(null);
  };

  const handlePhotoSent = (imageUrl: string, storagePath: string) => {
    sendImage(imageUrl, storagePath, getReplyPayload());
    setShowCamera(false);
    setReplyingTo(null);
  };

  const handleSelectDocument = (docItem: InternalSystemDocument) => {
    sendDocument({
      pdfUrl: docItem.pdfUrl,
      documentName: docItem.subject,
      documentNo: docItem.no,
      documentDate: docItem.docDate,
      documentCategory: docItem.category,
      documentId: docItem.id,
      documentLink: docItem.category === "หนังสือรับ/งานมอบหมาย" ? `/director/assigned-work?id=${docItem.id}` : undefined,
    }, getReplyPayload());
    setShowDocPicker(false);
    setReplyingTo(null);
  };

  const handlePickEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const renderReplyQuote = (msg: ChatMessage, isMine: boolean) => {
    if (!msg.replyTo) return null;
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          scrollToMessage(msg.replyTo?.id);
        }}
        className={`mb-1 flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white/95 px-2.5 py-1 text-left shadow-xs transition hover:bg-gray-50 dark:border-gray-700/80 dark:bg-[#323336] dark:hover:bg-[#3a3b3e] max-w-[240px]`}
        title="คลิกเพื่อเลื่อนไปยังข้อความต้นฉบับ"
      >
        <Reply size={12} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
            ตอบกลับ {msg.replyTo.senderName}
          </p>
          <p className="truncate text-[10.5px] text-gray-600 dark:text-gray-300">
            {msg.replyTo.text || "ข้อความ"}
          </p>
        </div>
      </div>
    );
  };

  const renderMessageContent = (msg: (typeof messages)[number], isMine: boolean) => {
    if (msg.type === "attendance" && msg.attendance) {
      return (
        <div className="w-full">
          <AttendanceNotificationCard attendance={msg.attendance} compact />
        </div>
      );
    }
    if (msg.type === "sticker" && msg.stickerId) {
      return (
        <div>
          <img src={stickerFileUrl(msg.stickerId)} alt="sticker" className="h-24 w-24 object-contain" />
        </div>
      );
    }
    if (msg.type === "gif" && msg.gifUrl) {
      return (
        <div>
          <img src={msg.gifUrl} alt="gif" className="max-h-40 max-w-[200px] rounded-xl object-cover" />
        </div>
      );
    }
    if (msg.type === "image" && msg.imageUrl) {
      return (
        <div>
          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
            <img src={msg.imageUrl} alt="รูปภาพ" className="max-h-52 max-w-[200px] rounded-xl object-cover" />
          </a>
        </div>
      );
    }
    if (msg.type === "document" && msg.pdfUrl) {
      const isAssignedWork = msg.documentCategory?.includes("มอบหมาย") || msg.documentCategory?.includes("ผอ.") || !!msg.documentLink || !!msg.documentId;

      const handleOpenDocument = () => {
        if (isAssignedWork) {
          const params = new URLSearchParams();
          if (msg.documentId) params.set("id", msg.documentId);
          if (msg.documentNo) params.set("receiveNo", msg.documentNo);
          if (msg.pdfUrl) params.set("pdfUrl", msg.pdfUrl);
          if (msg.documentName) params.set("subject", msg.documentName);
          params.set("autoOpen", "true");
          navigate(`/director/assigned-work?${params.toString()}`);
        } else if (msg.pdfUrl) {
          window.open(msg.pdfUrl, "_blank");
        }
      };

      return (
        <div 
          onClick={handleOpenDocument}
          className={`w-full max-w-[240px] cursor-pointer overflow-hidden rounded-2xl border text-left shadow-xs transition hover:shadow-md ${
            isMine 
              ? "border-indigo-500/40 bg-indigo-600 text-white" 
              : "border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-[#323336] dark:text-white"
          }`}
        >
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold ${
                isMine ? "bg-white/20 text-white" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              }`}>
                <FileText size={10} />
                {msg.documentCategory || "เอกสารในระบบ"}
              </span>
              {msg.documentDate && (
                <span className={`text-[9.5px] ${isMine ? "text-white/70" : "text-gray-400 dark:text-gray-400"}`}>
                  {msg.documentDate}
                </span>
              )}
            </div>
            
            <p className="line-clamp-2 text-xs font-bold leading-tight">
              {msg.documentName || "เอกสาร PDF"}
            </p>
            {msg.documentNo && (
              <p className={`mt-0.5 text-[10px] ${isMine ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                เลขที่: {msg.documentNo}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDocument();
            }}
            className={`flex w-full items-center justify-center gap-1.5 border-t px-2.5 py-1.5 text-xs font-semibold transition ${
              isMine
                ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
                : "border-gray-100 bg-gray-50 text-indigo-600 hover:bg-indigo-50 dark:border-gray-700/60 dark:bg-gray-800/60 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
            }`}
          >
            <ExternalLink size={12} />
            {isAssignedWork ? "เปิดดูในระบบงานมอบหมาย" : "เปิดดูเอกสาร PDF"}
          </button>
        </div>
      );
    }
    return (
      <div className={`rounded-2xl px-3 py-1.5 text-sm ${isMine ? "bg-indigo-600 text-white" : "bg-white text-gray-900 dark:bg-[#3a3b3c] dark:text-white"}`}>
        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
      </div>
    );
  };

  return (
    <div
      className="fixed bottom-0 z-[9998] flex w-[320px] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-gray-200 bg-gray-100 shadow-2xl transition-all dark:border-gray-700 dark:bg-[#2a2b2f]"
      style={{ right: offsetRight, height: minimized ? "auto" : 440 }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-200 bg-gray-100 p-3 text-left dark:border-gray-700 dark:bg-[#2a2b2f]">
        {isOneOnOneRoom ? (
          <img
            src={otherPartyPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherPartyName || "?")}&background=random`}
            alt={otherPartyName}
            className="h-9 w-9 shrink-0 rounded-full object-cover object-[center_20%]"
          />
        ) : isGroupRoom ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <UsersRound size={16} />
          </div>
        ) : (roomId === SCHOOL_CHAT_ROOM_ID || otherPartyPhotoUrl) ? (
          otherPartyPhotoUrl ? (
            <img
              src={otherPartyPhotoUrl}
              alt="School Logo"
              className="h-9 w-9 shrink-0 rounded-full object-cover bg-white p-0.5 border border-gray-200 dark:border-gray-600 shadow-xs"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <School size={17} />
            </div>
          )
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
            <MessageCircle size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                className="w-full rounded-md border border-indigo-400 bg-white px-2 py-0.5 text-xs font-semibold text-gray-900 focus:outline-hidden dark:bg-[#1e1f21] dark:text-white"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="บันทึก"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/10"
                title="ยกเลิก"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p
                onClick={onToggleMinimize}
                className="truncate text-sm font-bold text-gray-900 dark:text-white cursor-pointer select-none"
              >
                {title}
              </p>
              {canEditTitle && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTitle(title);
                    setIsEditingTitle(true);
                  }}
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/80 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                  title="เปลี่ยนชื่อห้องแชท"
                >
                  <Pencil size={11} />
                </span>
              )}
            </div>
          )}
          {isOneOnOneRoom && !isEditingTitle && (
            isOtherPartyOnline ? (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                </span>
                <span className="truncate">ออนไลน์</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                <span className="truncate">ออฟไลน์</span>
              </div>
            )
          )}
          {isGroupRoom && !isEditingTitle && <p className="truncate text-[10px] text-gray-400">{groupMemberCount} ครอบครัว</p>}
          {(isSchoolRoom || isDeptRoom) && !isEditingTitle && (
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </span>
              <span className="truncate">
                {totalTeacherCount > 0
                  ? `ครูในแชทนี้ ${totalTeacherCount} คน • ออนไลน์ ${onlineTeacherCount} คน`
                  : `ครูออนไลน์อยู่ ${onlineTeacherCount} คน`}
              </span>
            </div>
          )}
        </div>
        {isDeptRoom && schoolId && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); setShowAddMember(true); }}
            title="เพิ่มเพื่อนร่วมงาน"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <UserPlus size={15} />
          </span>
        )}
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <Minus size={14} />
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <X size={14} />
        </span>
      </div>

      {showAddMember && schoolId && (
        <DeptChatMemberPicker schoolId={schoolId} roomId={roomId} roomLabel={title} onClose={() => setShowAddMember(false)} />
      )}

      {showCamera && schoolId && (
        <CameraCapture schoolId={schoolId} roomId={roomId} onClose={() => setShowCamera(false)} onSent={handlePhotoSent} />
      )}

      {!minimized && (
        <>
          {isPending && (
            <div className="shrink-0 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              รอครูตอบรับคำขอสนทนา...
            </div>
          )}
          {isRejected && (
            <div className="shrink-0 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              ครูปฏิเสธคำขอสนทนานี้
            </div>
          )}
          {notYetDeptMember && (
            <div className="shrink-0 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              คุณยังไม่ได้เป็นสมาชิกห้องนี้ กดไอคอน <UserPlus size={11} className="inline" /> ด้านบนเพื่อเพิ่มตัวเอง
            </div>
          )}

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 space-y-2 overflow-y-auto bg-gray-100 p-3 dark:bg-[#2a2b2f]"
          >
            {messages.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-400">ยังไม่มีข้อความ เริ่มทักทายกันได้เลย</p>
            ) : (
              // แสดงรูป+ชื่อผู้ส่งเหนือข้อความของ "อีกฝ่าย" ทุกคน (ไม่ใช่แค่คนเดียว) เพื่อแยกให้เห็นชัดว่า
              // ใครส่ง โดยเฉพาะห้องที่มีครูประจำชั้นมากกว่า 1 คนคุยสลับกัน — ยุบรูป+ชื่อซ้ำถ้าข้อความก่อน
              // หน้านี้เป็นคนเดิมส่งติดกัน (แนวทางเดียวกับแอปแชทกลุ่มทั่วไป แต่ออกแบบหน้าตาเอง ไม่ได้ก็อปใคร)
              messages.map((msg, index) => {
                const isMine = chatIsMine(msg);
                const readInfo = isMine ? getMessageReadStatus(msg) : null;
                const prevMsg = messages[index - 1];
                const showSenderInfo = !isMine && (!prevMsg || prevMsg.senderUid !== msg.senderUid);
                const isAttendance = msg.type === "attendance";
                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`group relative flex items-end gap-1 ${isMine ? "justify-end" : "justify-start"} ${isAttendance ? "w-full my-1.5" : ""}`}
                  >
                    {!isMine && !isAttendance && (
                      <div className="h-6 w-6 shrink-0">
                        {showSenderInfo && (
                          <img
                            src={msg.senderPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName)}&background=random`}
                            alt={msg.senderName}
                            className="h-6 w-6 rounded-full object-cover object-[center_20%]"
                          />
                        )}
                      </div>
                    )}
                    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} gap-0.5 ${isAttendance ? "w-full" : "max-w-[80%]"}`}>
                      {showSenderInfo && !isAttendance && (
                        <p className="ml-1 text-[10px] font-bold text-gray-500 dark:text-gray-400">{msg.senderName}</p>
                      )}
                      {renderReplyQuote(msg, isMine)}

                      {/* แถวบับเบิลข้อความพร้อมปุ่มตอบกลับแนบชิดบับเบิล */}
                      <div className={`flex items-center gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
                        {isMine && !isAttendance && (
                          <button
                            type="button"
                            onClick={() => handleStartReply(msg)}
                            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 opacity-0 transition-all hover:bg-gray-200/80 hover:text-indigo-600 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                            title="ตอบกลับ"
                          >
                            <Reply size={12} />
                          </button>
                        )}

                        {renderMessageContent(msg, isMine)}

                        {!isMine && !isAttendance && (
                          <button
                            type="button"
                            onClick={() => handleStartReply(msg)}
                            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 opacity-0 transition-all hover:bg-gray-200/80 hover:text-indigo-600 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                            title="ตอบกลับ"
                          >
                            <Reply size={12} />
                          </button>
                        )}
                      </div>

                      {/* แสดงสถานะอ่านแล้ว และเวลา */}
                      <div className={`mt-0.5 flex items-center gap-1 px-1 select-none ${isMine ? "justify-end" : "justify-start"}`}>
                        {isMine && readInfo?.isRead && (
                          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                            {readInfo.label}
                          </span>
                        )}
                        {isMine && readInfo?.isRead && msg.createdAt && (
                          <span className="text-[9px] text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-gray-500">
                            •
                          </span>
                        )}
                        {msg.createdAt && (
                          <span
                            className={`text-[9px] text-gray-400 transition-opacity duration-150 dark:text-gray-500 ${
                              isMine && readInfo?.isRead ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {formatChatMessageDateTime(msg.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          {canChat && (
            <div className="relative shrink-0 border-t border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-[#2a2b2f]">
              {/* แถบพรีวิวข้อความที่กำลังตอบกลับ */}
              {replyingTo && (
                <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/90 px-3 py-1.5 dark:border-indigo-900/40 dark:bg-[#20232b]">
                  <div className="flex items-center gap-2 overflow-hidden text-xs">
                    <Reply size={13} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                        ตอบกลับ {replyingTo.senderName}
                      </p>
                      <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {getReplyPreviewText(replyingTo)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    title="ยกเลิกการตอบกลับ"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {activePicker && (
                <div className="absolute bottom-full left-0 right-0 z-20 overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-[#242526]">
                  {/* แถบแท็บสไตล์มาตรฐานสากล (อีโมจิ / สติกเกอร์ / GIF) */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/90 px-3 py-2 dark:border-gray-700/80 dark:bg-[#1a1b1e]">
                    <div className="flex items-center gap-1 rounded-xl bg-gray-200/60 p-0.5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setActivePicker("emoji")}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          activePicker === "emoji"
                            ? "bg-white text-indigo-600 shadow-xs dark:bg-[#2a2b2f] dark:text-indigo-400"
                            : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        }`}
                      >
                        <Smile size={13} />
                        อีโมจิ
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePicker("sticker")}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          activePicker === "sticker"
                            ? "bg-white text-indigo-600 shadow-xs dark:bg-[#2a2b2f] dark:text-indigo-400"
                            : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        }`}
                      >
                        <StickerIcon size={13} />
                        สติกเกอร์
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePicker("gif")}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          activePicker === "gif"
                            ? "bg-white text-indigo-600 shadow-xs dark:bg-[#2a2b2f] dark:text-indigo-400"
                            : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        }`}
                      >
                        <span className="rounded border border-current px-1 text-[9px] font-black leading-none tracking-wider">GIF</span>
                        GIF
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePicker(null)}
                      className="cursor-pointer rounded-lg p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200 transition"
                      title="ปิด"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* เนื้อหา Picker */}
                  <div className="max-h-64 overflow-y-auto">
                    {activePicker === "sticker" ? (
                      <StickerPicker onSelect={handlePickSticker} />
                    ) : activePicker === "gif" ? (
                      <GifPicker onSelect={handlePickGif} />
                    ) : (
                      <EmojiPicker onSelect={handlePickEmoji} onClose={() => setActivePicker(null)} />
                    )}
                  </div>
                </div>
              )}

              {/* แถบพิมพ์ข้อความสไตล์ Enterprise Workspace Card (ไม่เลียนแบบ Facebook) */}
              <div className="p-2.5 bg-gray-50/80 dark:bg-[#1a1b1e] border-t border-gray-100 dark:border-gray-800/80">
                <div className="flex flex-col rounded-2xl border border-gray-200/90 bg-white shadow-2xs transition-all focus-within:border-gray-300 dark:border-gray-700/80 dark:bg-[#202124] dark:focus-within:border-gray-600">
                  {/* ช่องพิมพ์ข้อความแบบ Auto-expanding Textarea */}
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="พิมพ์ข้อความ... (Shift + Enter ขึ้นบรรทัดใหม่)"
                    className="no-focus-ring chat-composer-textarea max-h-28 min-h-[36px] w-full resize-none border-none bg-transparent px-3 pt-2 pb-1 text-xs leading-relaxed text-gray-900 outline-none !shadow-none !ring-0 placeholder:text-gray-400 focus:border-none focus:outline-none focus:!ring-0 focus:!shadow-none dark:text-white dark:placeholder:text-gray-500"
                    style={{ height: "auto", boxShadow: "none" }}
                  />

                  {/* แถบเครื่องมือภายในกล่อง (Integrated Toolbar) */}
                  <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
                    {/* ปุ่มเครื่องมือซ้าย: แนบเอกสาร PDF, ถ่ายภาพ, อีโมจิ/สติกเกอร์/GIF */}
                    <div className="flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
                      {schoolId && (
                        <button
                          type="button"
                          onClick={() => setShowDocPicker(true)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                          title="แนบเอกสาร PDF ในระบบ"
                        >
                          <Paperclip size={15} />
                        </button>
                      )}

                      {schoolId && (
                        <button
                          type="button"
                          onClick={() => setShowCamera(true)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                          title="ถ่ายภาพจากกล้อง"
                        >
                          <Camera size={15} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setActivePicker((p) => (p ? null : "emoji"))}
                        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition active:scale-95 ${
                          activePicker
                            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300"
                            : "hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                        }`}
                        title="อีโมจิ / สติกเกอร์ / GIF"
                      >
                        <Smile size={15} />
                      </button>
                    </div>

                    {/* ปุ่มส่งข้อความแบบ Enterprise Squircle */}
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!text.trim() || isSending}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                        text.trim() && !isSending
                          ? "cursor-pointer bg-indigo-600 text-white shadow-2xs hover:bg-indigo-700 active:scale-95"
                          : "cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-white/5 dark:text-gray-600"
                      }`}
                      title="ส่งข้อความ (Enter)"
                    >
                      <Send size={13} className={text.trim() ? "translate-x-0.5" : ""} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showDocPicker && schoolId && (
        <InternalDocumentPickerModal
          schoolId={schoolId}
          onClose={() => setShowDocPicker(false)}
          onSelect={handleSelectDocument}
        />
      )}
    </div>
  );
};

export default FloatingChatWindow;
