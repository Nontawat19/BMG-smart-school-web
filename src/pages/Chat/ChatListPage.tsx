import React from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { MessageCircle } from "lucide-react";
import ChatRoomList from "./ChatRoomList";
import { useChatWidget } from "./ChatWidgetContext";

const ChatListPage: React.FC = () => {
  const { openChat } = useChatWidget();

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-60px)] bg-gray-50 p-4 text-gray-900 dark:bg-[#1e1f21] dark:text-white sm:p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <header>
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f]">
              <BackButton to="/notifications" />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
                <MessageCircle size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight">แชท</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">เลือกห้องแชทที่ต้องการเปิด</p>
              </div>
            </div>
          </header>

          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f]">
            <ChatRoomList onSelectRoom={openChat} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ChatListPage;
