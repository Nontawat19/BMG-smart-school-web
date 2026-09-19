import React from "react";
import { useChatWidget } from "./ChatWidgetContext";
import FloatingChatWindow from "./FloatingChatWindow";

// วางเรียงจากขวาไปซ้าย เหมือน Facebook Messenger (แต่ละบานกว้าง 320px + เว้นระยะ 16px)
const WINDOW_WIDTH = 320;
const GAP = 12;
const BASE_OFFSET = 24;

const FloatingChatManager: React.FC = () => {
  const { openWindows, closeChat, toggleMinimize } = useChatWidget();

  if (openWindows.length === 0) return null;

  return (
    <>
      {openWindows.map((win, index) => (
        <FloatingChatWindow
          key={win.roomId}
          roomId={win.roomId}
          minimized={win.minimized}
          offsetRight={BASE_OFFSET + index * (WINDOW_WIDTH + GAP)}
          onClose={() => closeChat(win.roomId)}
          onToggleMinimize={() => toggleMinimize(win.roomId)}
        />
      ))}
    </>
  );
};

export default FloatingChatManager;
