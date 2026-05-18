import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { ClipboardCheck, Users, User, Home } from 'lucide-react';

const ScreeningHub: React.FC = () => {
    return (
        <MainLayout>
<<<<<<< HEAD
            <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
                <div className="max-w-5xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">ระบบคัดกรองนักเรียน (Student Screening)</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-8">เลือกส่วนงานที่ต้องการเข้าถึงสำหรับบันทึกข้อมูลคัดกรอง 4 ด้าน</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Link to="/student-support/screening/teacher" className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center group">
                            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-full mb-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                                <Users size={40} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">สำหรับครู</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">บันทึกข้อมูลคัดกรองนักเรียนรายบุคคล (Official)</p>
                        </Link>

                        <Link to="/student-support/screening/student" className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center group">
                            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-full mb-4 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                <User size={40} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">สำหรับนักเรียน</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">นักเรียนประเมินตนเอง (ความสามารถ, สุขภาพ)</p>
                        </Link>

                        <Link to="/student-support/screening/parent" className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center group">
                            <div className="bg-pink-50 dark:bg-pink-900/30 p-4 rounded-full mb-4 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/50 transition-colors">
                                <Home size={40} className="text-pink-600 dark:text-pink-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">สำหรับผู้ปกครอง</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">ผู้ปกครองให้ข้อมูลครอบครัวและสุขภาพ</p>
=======
            <div className="p-8 bg-gray-50 min-h-screen">
                <div className="max-w-5xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">ระบบคัดกรองนักเรียน (Student Screening)</h1>
                    <p className="text-gray-500 mb-8">เลือกส่วนงานที่ต้องการเข้าถึงสำหรับบันทึกข้อมูลคัดกรอง 4 ด้าน</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Link to="/student-support/screening/teacher" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center text-center group">
                            <div className="bg-indigo-50 p-4 rounded-full mb-4 group-hover:bg-indigo-100 transition-colors">
                                <Users size={40} className="text-indigo-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">สำหรับครู</h3>
                            <p className="text-gray-500 text-sm">บันทึกข้อมูลคัดกรองนักเรียนรายบุคคล (Official)</p>
                        </Link>

                        <Link to="/student-support/screening/student" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center text-center group">
                            <div className="bg-blue-50 p-4 rounded-full mb-4 group-hover:bg-blue-100 transition-colors">
                                <User size={40} className="text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">สำหรับนักเรียน</h3>
                            <p className="text-gray-500 text-sm">นักเรียนประเมินตนเอง (ความสามารถ, สุขภาพ)</p>
                        </Link>

                        <Link to="/student-support/screening/parent" className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center text-center group">
                            <div className="bg-pink-50 p-4 rounded-full mb-4 group-hover:bg-pink-100 transition-colors">
                                <Home size={40} className="text-pink-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">สำหรับผู้ปกครอง</h3>
                            <p className="text-gray-500 text-sm">ผู้ปกครองให้ข้อมูลครอบครัวและสุขภาพ</p>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        </Link>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default ScreeningHub;
