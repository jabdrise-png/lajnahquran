
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

    // Fase 7b: semua tombol menu memakai gaya tombol standar (sekunder), primary hanya bila diminta
    let buttonClass = variant === 'primary' || variant === 'blue' ? 'btn btn-primary' : 'btn btn-secondary';
    void variant;

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
                <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                    <div className="py-1">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActionDropdown;
