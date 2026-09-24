import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { Send, MessageCircle, Reply, Smile, X, FileText, ExternalLink, Pencil, Check, School, Paperclip, Camera, Sticker as StickerIcon, Plus } from "lucide-react";
import { formatChatMessageDateTime, getReplyPreviewText, SCHOOL_CHAT_ROOM_ID } from "./chatConstants";
import { stickerFileUrl } from "./stickerConstants";
import EmojiPicker from "./EmojiPicker";
import StickerPicker from "./StickerPicker";
import GifPicker from "./GifPicker";
import { GifResult } from "./giphy";
import CameraCapture from "./CameraCapture";
import InternalDocumentPickerModal, { InternalSystemDocument } from "./InternalDocumentPickerModal";
import AttendanceNotificationCard from "@/pages/Notifications/AttendanceNotificationCard";
import { useChatMessages, ChatMessage } from "./useChatMessages";

const ChatRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { roomId = "" } = useParams<{ roomId: string }>();
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activePicker, setActivePicker] = useState<"emoji" | "sticker" | "gif" | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${Math.max(nextHeight, 32)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);

  // ใช้ useChatMessages เป็นตัวจัดการทั้งหมด (Real-time listener, role & stableId resolution,
  // มาร์คอ่านแล้วทันทีเมื่อเปิดดูหรือมีข้อความใหม่, และสถานะอ่านแล้ว)
  const {
    messages,
    sendMessage,
    sendSticker,
    sendGif,
    sendImage,
    sendDocument,
    isSending,
    isMine,
    getMessageReadStatus,
    title,
    otherPartyPhotoUrl,
    groupMemberCount,
    onlineTeacherCount,
    totalTeacherCount,
    isOneOnOneRoom,
    isOtherPartyOnline,
    schoolId,
    roomType,
    updateRoomTitle,
  } = useChatMessages(roomId, true);

  const isSchoolRoom = roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID;
  const isDeptRoom = roomType === "department";
  const isGroupRoom = roomType === "group";
  const canEditTitle = roomId === SCHOOL_CHAT_ROOM_ID || isGroupRoom;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const handleSaveTitle = async () => {
    if (!editTitle.trim()) return;
    await updateRoomTitle(editTitle);
    setIsEditingTitle(false);
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const prevMessagesCountRef = useRef(0);

  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesCountRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (messages.length === 0) return;
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
  }, [messages]);

  const handleStartReply = (msg: ChatMessage) => {
    setReplyingTo(msg);
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
      senderName: (isMine(replyingTo) ? "คุณ" : replyingTo.senderName) || "ผู้ใช้งาน",
      text: getReplyPreviewText(replyingTo) || "ข้อความ",
      type: replyingTo.type || "text",
    };
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    await sendMessage(trimmed, getReplyPayload());
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

  const renderReplyQuote = (msg: ChatMessage, msgIsMine: boolean) => {
    if (!msg.replyTo) return null;
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          scrollToMessage(msg.replyTo?.id);
        }}
        className="mb-1 flex max-w-[280px] cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white/95 px-3 py-1.5 text-left shadow-xs transition hover:bg-gray-50 dark:border-gray-700/80 dark:bg-[#323336] dark:hover:bg-[#3a3b3e]"
        title="คลิกเพื่อเลื่อนไปยังข้อความต้นฉบับ"
      >
        <Reply size={13} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-indigo-600 dark:text-indigo-400">
            ตอบกลับ {msg.replyTo.senderName}
          </p>
          <p className="truncate text-xs text-gray-600 dark:text-gray-300">
            {msg.replyTo.text || "ข้อความ"}
          </p>
        </div>
      </div>
    );
  };

  const handlePickEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-60px)] flex-col bg-gray-50 dark:bg-[#1e1f21]">
        <header className="shrink-0 border-b border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#2a2b2f]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <BackButton to="/chat" />
            {otherPartyPhotoUrl ? (
              <img
                src={otherPartyPhotoUrl}
                alt={title}
                className="h-10 w-10 shrink-0 rounded-full object-cover bg-white p-0.5 border border-gray-200 dark:border-gray-700 shadow-xs"
              />
            ) : roomId === SCHOOL_CHAT_ROOM_ID ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                <School size={20} />
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
                <MessageCircle size={18} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="w-full max-w-sm rounded-lg border border-indigo-400 bg-white px-3 py-1 text-sm font-semibold text-gray-900 focus:outline-hidden dark:bg-[#1e1f21] dark:text-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    title="บันทึก"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(false)}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    title="ยกเลิก"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold text-gray-900 dark:text-white">{title}</p>
                  {canEditTitle && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditTitle(title);
                        setIsEditingTitle(true);
                      }}
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300 transition"
                      title="เปลี่ยนชื่อห้องแชท"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}
              {isOneOnOneRoom && !isEditingTitle && (
                isOtherPartyOnline ? (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    </span>
                    <span>ออนไลน์</span>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span>ออฟไลน์</span>
                  </div>
                )
              )}
              {isGroupRoom && !isEditingTitle && (
                <p className="mt-0.5 text-xs text-gray-400">{groupMemberCount} ครอบครัว</p>
              )}
              {(isSchoolRoom || isDeptRoom) && !isEditingTitle && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span>
                    {totalTeacherCount > 0
                      ? `ครูในแชทนี้ ${totalTeacherCount} คน • ออนไลน์อยู่ ${onlineTeacherCount} คน`
                      : `ครูออนไลน์อยู่ ${onlineTeacherCount} คน`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ข้อความทั้งหมด */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-3">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">ยังไม่มีข้อความ เริ่มทักทายกันได้เลย</p>
            ) : (
              messages.map((msg) => {
                const msgIsMine = isMine(msg);
                const readInfo = msgIsMine ? getMessageReadStatus(msg) : null;
                const isAttendance = msg.type === "attendance";
                if (isAttendance && msg.attendance) {
                  return (
                    <div key={msg.id} id={`chat-msg-${msg.id}`} className="my-3 flex justify-center">
                      <div className="w-full max-w-md">
                        {renderReplyQuote(msg, msgIsMine)}
                        <AttendanceNotificationCard attendance={msg.attendance} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`group relative flex items-end gap-1.5 ${msgIsMine ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`flex flex-col ${msgIsMine ? "items-end" : "items-start"} max-w-[85%]`}>
                      {!msgIsMine && (
                        <p className="mb-1 ml-1 text-xs font-bold text-gray-500 dark:text-gray-400">{msg.senderName}</p>
                      )}
                      {renderReplyQuote(msg, msgIsMine)}

                      {/* แถวบับเบิลข้อความพร้อมปุ่มตอบกลับแนบชิดบับเบิล */}
                      <div className={`flex items-center gap-1.5 ${msgIsMine ? "justify-end" : "justify-start"}`}>
                        {msgIsMine && (
                          <button
                            type="button"
                            onClick={() => handleStartReply(msg)}
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 opacity-0 transition-all hover:bg-gray-200/80 hover:text-indigo-600 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                            title="ตอบกลับ"
                          >
                            <Reply size={13} />
                          </button>
                        )}

                        {msg.type === "image" && msg.imageUrl ? (
                          <div>
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                              <img src={msg.imageUrl} alt="รูปภาพ" className="max-h-64 max-w-[280px] rounded-2xl object-cover shadow-sm transition hover:opacity-95" />
                            </a>
                          </div>
                        ) : msg.type === "sticker" && msg.stickerId ? (
                          <div>
                            <img src={stickerFileUrl(msg.stickerId)} alt="sticker" className="h-24 w-24 object-contain" />
                          </div>
                        ) : msg.type === "gif" && msg.gifUrl ? (
                          <div>
                            <img src={msg.gifUrl} alt="gif" className="max-h-52 max-w-[240px] rounded-xl object-cover" />
                          </div>
                        ) : msg.type === "document" && msg.pdfUrl ? (
                          (() => {
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
                                className={`w-full max-w-[280px] cursor-pointer overflow-hidden rounded-2xl border text-left shadow-xs transition hover:shadow-md ${
                                  msgIsMine 
                                    ? "border-indigo-500/40 bg-indigo-600 text-white" 
                                    : "border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-[#2a2b2f] dark:text-white"
                                }`}
                              >
                                <div className="p-3">
                                  <div className="mb-1.5 flex items-center justify-between gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                      msgIsMine ? "bg-white/20 text-white" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                                    }`}>
                                      <FileText size={11} />
                                      {msg.documentCategory || "เอกสารในระบบ"}
                                    </span>
                                    {msg.documentDate && (
                                      <span className={`text-[10px] ${msgIsMine ? "text-white/70" : "text-gray-400 dark:text-gray-400"}`}>
                                        {msg.documentDate}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className="line-clamp-2 text-sm font-bold leading-tight">
                                    {msg.documentName || "เอกสาร PDF"}
                                  </p>
                                  {msg.documentNo && (
                                    <p className={`mt-0.5 text-xs ${msgIsMine ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
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
                                  className={`flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-semibold transition ${
                                    msgIsMine
                                      ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
                                      : "border-gray-100 bg-gray-50 text-indigo-600 hover:bg-indigo-50 dark:border-gray-700/60 dark:bg-gray-800/60 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                                  }`}
                                >
                                  <ExternalLink size={13} />
                                  {isAssignedWork ? "เปิดดูในระบบงานมอบหมาย" : "เปิดดูเอกสาร PDF"}
                                </button>
                              </div>
                            );
                          })()
                        ) : (
                          <div className={`max-w-[480px] rounded-2xl px-4 py-2.5 ${msgIsMine ? "bg-indigo-600 text-white" : "border border-gray-100 bg-white text-gray-900 dark:border-gray-700 dark:bg-[#2a2b2f] dark:text-white"}`}>
                            <p className="whitespace-pre-wrap break-words text-sm">{msg.text}</p>
                          </div>
                        )}

                        {!msgIsMine && (
                          <button
                            type="button"
                            onClick={() => handleStartReply(msg)}
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 opacity-0 transition-all hover:bg-gray-200/80 hover:text-indigo-600 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                            title="ตอบกลับ"
                          >
                            <Reply size={13} />
                          </button>
                        )}
                      </div>

                      {/* แสดงสถานะอ่านแล้ว และเวลา */}
                      <div className={`mt-0.5 flex items-center gap-1 px-1 select-none ${msgIsMine ? "justify-end" : "justify-start"}`}>
                        {msgIsMine && readInfo?.isRead && (
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            {readInfo.label}
                          </span>
                        )}
                        {msgIsMine && readInfo?.isRead && msg.createdAt && (
                          <span className="text-[10px] text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-gray-500">
                            •
                          </span>
                        )}
                        {msg.createdAt && (
                          <span className="text-[10px] text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-gray-500">
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
        </div>

        {/* แถบพรีวิวข้อความที่กำลังตอบกลับ */}
        {replyingTo && (
          <div className="border-t border-indigo-100 bg-indigo-50/90 p-2.5 dark:border-indigo-900/40 dark:bg-[#20232b]">
            <div className="mx-auto flex max-w-2xl items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden text-xs">
                <Reply size={14} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    ตอบกลับ {replyingTo.senderName}
                  </p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {getReplyPreviewText(replyingTo)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                title="ยกเลิกการตอบกลับ"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* แผงเลือก Expression (Emoji / Sticker / GIF) สไตล์สากล */}
        {activePicker && (
          <div className="border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#242526]">
            <div className="mx-auto max-w-2xl">
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
          </div>
        )}

        {/* แถบพิมพ์ข้อความสไตล์ Enterprise Workspace Card (ไม่เลียนแบบ Facebook) — ห้องแจ้งเตือนลงเวลาเป็นแบบอ่านอย่างเดียว */}
        {roomType !== "staff-attendance" && (
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800/80 dark:bg-[#1a1b1e]">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-col rounded-2xl border border-gray-200/90 bg-white shadow-2xs transition-all focus-within:border-gray-300 dark:border-gray-700/80 dark:bg-[#202124] dark:focus-within:border-gray-600">
              {/* ช่องพิมพ์ข้อความแบบ Auto-expanding Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์ข้อความ... (Shift + Enter ขึ้นบรรทัดใหม่)"
                className="no-focus-ring chat-composer-textarea max-h-36 min-h-[40px] w-full resize-none border-none bg-transparent px-4 pt-2.5 pb-1 text-sm leading-relaxed text-gray-900 outline-none !shadow-none !ring-0 placeholder:text-gray-400 focus:border-none focus:outline-none focus:!ring-0 focus:!shadow-none dark:text-white dark:placeholder:text-gray-500"
                style={{ height: "auto", boxShadow: "none" }}
              />

              {/* แถบเครื่องมือภายในกล่อง (Integrated Toolbar) */}
              <div className="flex items-center justify-between px-3 pb-2 pt-0.5">
                {/* ปุ่มเครื่องมือซ้าย: แนบเอกสาร PDF, ถ่ายภาพ, อีโมจิ/สติกเกอร์/GIF */}
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  {schoolId && (
                    <button
                      type="button"
                      onClick={() => setShowDocPicker(true)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                      title="แนบเอกสาร PDF ในระบบ"
                    >
                      <Paperclip size={17} />
                    </button>
                  )}

                  {schoolId && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                      title="ถ่ายภาพจากกล้อง"
                    >
                      <Camera size={17} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActivePicker((p) => (p ? null : "emoji"))}
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition active:scale-95 ${
                      activePicker
                        ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300"
                        : "hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                    }`}
                    title="อีโมจิ / สติกเกอร์ / GIF"
                  >
                    <Smile size={17} />
                  </button>
                </div>

                {/* ปุ่มส่งข้อความแบบ Enterprise */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!text.trim() || isSending}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                    text.trim() && !isSending
                      ? "cursor-pointer bg-indigo-600 text-white shadow-2xs hover:bg-indigo-700 active:scale-95"
                      : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-600"
                  }`}
                  title="ส่งข้อความ (Enter)"
                >
                  <span>ส่ง</span>
                  <Send size={13} className={text.trim() ? "translate-x-0.5" : ""} />
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

        {showCamera && schoolId && (
          <CameraCapture schoolId={schoolId} roomId={roomId} onClose={() => setShowCamera(false)} onSent={handlePhotoSent} />
        )}

        {showDocPicker && schoolId && (
          <InternalDocumentPickerModal
            schoolId={schoolId}
            onClose={() => setShowDocPicker(false)}
            onSelect={handleSelectDocument}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default ChatRoomPage;
