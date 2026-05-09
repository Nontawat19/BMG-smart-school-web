import React from 'react';
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

interface LogoutButtonProps {
  className?: string;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ className }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("ออกจากระบบเรียบร้อยแล้ว!");

      // ✅ เคลียร์ session หรืออะไรก็ตามได้เลย (force clean)
      localStorage.clear();
      sessionStorage.clear();

      setTimeout(() => {
        navigate("/login", { replace: true }); // replace:true ป้องกัน Back กลับมาได้
      }, 2000);
    } catch (error) {
      console.error(error);
      toast.error("เกิดข้อผิดพลาดในการออกจากระบบ");
    }
  };

  return (
    <button onClick={handleLogout} className={className}>
      ออกจากระบบ
    </button>
  );
};

export default LogoutButton;
