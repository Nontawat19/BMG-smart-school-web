// src/components/ToastContent.tsx
import React from 'react';

interface ToastContentProps {
  title: string;
  message: string;
}

const ToastContent: React.FC<ToastContentProps> = ({ title, message }) => {
  return (
    <div>
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{title}</div>
      <div>{message}</div>
    </div>
  );
};

export default ToastContent;
