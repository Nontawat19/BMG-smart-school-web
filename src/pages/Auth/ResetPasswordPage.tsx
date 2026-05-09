import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { confirmPasswordReset } from "firebase/auth";
import { auth } from "../../firebase";
import { ToastContainer, toast } from "react-toastify";
import ToastContent from "../../components/ToastContent";
import { showFirebaseError } from "../../utils/showFirebaseError";
import { FaBookOpen, FaLock, FaArrowRight, FaCheckCircle } from "react-icons/fa";

import "react-toastify/dist/ReactToastify.css";

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [oobCode, setOobCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("oobCode");
    if (code) {
      setOobCode(code);
    }
  }, [location.search]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.warn(<ToastContent title="ข้อมูลไม่ครบ" message="กรุณากรอกรหัสผ่านใหม่ให้ครบ" />);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(<ToastContent title="รหัสผ่านไม่ตรงกัน" message="กรุณายืนยันรหัสผ่านอีกครั้ง" />);
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      toast.success(<ToastContent title="รีเซ็ตรหัสผ่านสำเร็จ" message="กำลังกลับไปหน้าเข้าสู่ระบบ..." />);
      setTimeout(() => navigate("/login"), 2500);
    } catch (error: any) {
      console.error(error);
      showFirebaseError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 p-2 sm:p-4 transition-colors duration-300">
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />

      <div className="w-full max-w-5xl bg-white dark:bg-[#1f2937] rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row h-auto max-h-full lg:h-auto animate-fadeIn">

        {/* Left Side - Branding (Visible on Desktop) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 to-blue-500 relative flex-col items-center justify-center p-12 text-white overflow-hidden">
          {/* Abstract Shapes */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white blur-3xl"></div>
            <div className="absolute bottom-10 right-10 w-40 h-40 rounded-full bg-white blur-3xl"></div>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center space-y-8">
            <div className="flex flex-col items-center">
              <div className="p-5 bg-white/20 backdrop-blur-md rounded-2xl shadow-xl mb-6 border border-white/30 transform hover:scale-105 transition-transform duration-300">
                <FaBookOpen className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl font-black mb-1 tracking-tight text-white drop-shadow-md">
                EPP5 <span className="text-indigo-200">Online</span>
              </h1>
              <p className="text-indigo-100 text-xl font-medium tracking-wide">ระบบบันทึกผลการเรียนออนไลน์</p>
              <div className="mt-3 inline-block px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full border border-white/10">
                <p className="text-indigo-200 text-xs font-semibold tracking-widest uppercase">Powered by BMG Smart School</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-sm px-4">
              {[
                "ใช้งานง่ายสำหรับครู",
                "เช็คชื่อรายคาบ",
                "จัดการกิจกรรมชุมนุม",
                "สรุปผลการเรียนอัตโนมัติ"
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/5 hover:bg-white/20 transition-all duration-200 group">
                  <div className="flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FaCheckCircle className="text-emerald-400 text-sm" />
                  </div>
                  <p className="text-white text-[11px] font-medium text-left leading-tight">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black/10 to-transparent"></div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col justify-center relative">
          {/* Mobile Logo (Visible only on Mobile) */}
          <div className="lg:hidden flex flex-col items-center mb-4 text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center mb-2 shadow-lg transform rotate-3">
              <FaBookOpen className="text-white text-2xl" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">EPP5 Online</h2>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">รีเซ็ตรหัสผ่าน</h2>
            <p className="text-gray-500 dark:text-gray-400">กรุณากำหนดรหัสผ่านใหม่ของคุณ</p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">รหัสผ่านใหม่</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">ยืนยันรหัสผ่านใหม่</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? 'กำลังบันทึก...' : (
                <>
                  ตั้งรหัสผ่านใหม่ <FaArrowRight className="text-sm" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p
              onClick={() => navigate("/login")}
              className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              กลับสู่หน้าเข้าสู่ระบบ
            </p>
          </div>

          {/* Footer Text */}
          <div className="mt-8 text-center lg:text-left">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              &copy; 2025-{new Date().getFullYear()} EPP5 Online - BMG Smart School. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

