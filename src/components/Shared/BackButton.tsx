import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
    to?: string;
    className?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ to, className = "" }) => {
    const navigate = useNavigate();

    const handleBack = (e: React.MouseEvent) => {
        if (!to) {
            e.preventDefault();
            navigate(-1);
        }
    };

    return (
        <Link 
            to={to || "#"} 
            onClick={handleBack}
            className={`w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm ${className}`}
        >
            <ArrowLeft size={20} />
        </Link>
    );
};

export default BackButton;
