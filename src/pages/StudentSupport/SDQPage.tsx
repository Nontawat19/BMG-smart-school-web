import React from 'react';
import MainLayout from "@/layouts/MainLayout";
import { Link } from 'react-router-dom';
<<<<<<< HEAD
import BackButton from '@/components/Shared/BackButton';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import {
    User,
    GraduationCap,
    Home,
    ChevronRight,
    ClipboardList
} from 'lucide-react';

const SDQPage: React.FC = () => {

    const menuItems = [
        {
            title: 'นักเรียนประเมินตนเอง',
            description: 'สำหรับนักเรียนทำแบบประเมินด้วยตนเอง',
            icon: <GraduationCap size={32} />,
            path: '/student-support/sdq/student',
            colorClass: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
            hoverColor: 'group-hover:text-blue-600 dark:group-hover:text-blue-400'
        },
        {
            title: 'ครูประเมินนักเรียน',
            description: 'สำหรับครูประจำชั้นประเมินนักเรียน',
            icon: <User size={32} />,
            path: '/student-support/sdq/teacher',
            colorClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
            hoverColor: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
        },
        {
            title: 'ผู้ปกครองประเมินนักเรียน',
            description: 'สำหรับบันทึกผลการประเมินจากผู้ปกครอง',
            icon: <Home size={32} />,
            path: '/student-support/sdq/parent',
            colorClass: 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400',
            hoverColor: 'group-hover:text-green-600 dark:group-hover:text-green-400'
        }
    ];

    return (
        <MainLayout>
            <div className="p-4 sm:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
<<<<<<< HEAD
                        <div className="flex items-center gap-4 mb-2">
                            <BackButton />
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                <ClipboardList className="text-indigo-600" size={36} />
                                ระบบคัดกรองนักเรียน (SDQ)
                            </h1>
                        </div>
=======
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-2">
                            <ClipboardList className="text-indigo-600" size={36} />
                            ระบบคัดกรองนักเรียน (SDQ)
                        </h1>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        <p className="text-gray-500 dark:text-gray-400 text-lg">
                            เลือกหัวข้อการประเมินตามผู้ประเมิน
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {menuItems.map((item, index) => (
                            <Link
                                key={index}
                                to={item.path}
                                className="group relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 dark:border-gray-700 flex flex-col h-full"
                            >
                                <div className={`w-16 h-16 rounded-2xl ${item.colorClass} flex items-center justify-center mb-6 transition-transform group-hover:scale-110 shadow-sm`}>
                                    {item.icon}
                                </div>

                                <h3 className={`text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors ${item.hoverColor}`}>
                                    {item.title}
                                </h3>

                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-8 flex-grow">
                                    {item.description}
                                </p>

                                <div className="flex items-center text-sm font-bold text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300 mt-auto transition-colors">
                                    <span>เข้าสู่ระบบประเมิน</span>
                                    <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </Link>
                        ))}
                    </div>

                </div>
            </div>
        </MainLayout>
    );
};
export default SDQPage;
