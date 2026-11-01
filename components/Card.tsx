import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  id?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, id }) => {
  return (
    <div id={id} className={`bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] border border-slate-200/60 ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
      )}
      <div className="p-6">
          {children}
      </div>
    </div>
  );
};

// Simplified card without title header for dashboard widgets
export const WidgetCard: React.FC<Pick<CardProps, 'children' | 'className'>> = ({ children, className = '' }) => {
    return (
        <div className={`bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] border border-slate-200/60 p-6 ${className}`}>
            {children}
        </div>
    );
};


export default Card;