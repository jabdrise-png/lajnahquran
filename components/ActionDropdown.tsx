
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface ActionDropdownProps {
    label: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    variant?: 'primary' | 'outline' | 'secondary' | 'blue';
    className?: string;
}

const ActionDropdown: React.FC<ActionDropdownProps> = ({ label, icon, children, variant = 'outline', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    let buttonClass = "flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm ";
    if (variant === 'blue') {
        buttonClass = "inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 sm:px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 ";
    } else if (variant === 'primary') {
        buttonClass += "bg-secondary text-white hover:bg-accent ";
    } else if (variant === 'secondary') {
        buttonClass += "bg-green-600 text-white hover:bg-green-700 ";
    } else {
        buttonClass += "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 ";
    }

    if (className) {
        buttonClass = className;
    }

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)} 
                className={buttonClass}
            >
                {icon && <span className="mr-1.5 flex items-center">{icon}</span>}
                <span>{label}</span>
                <ChevronDown size={14} className={`ml-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="py-1">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActionDropdown;
