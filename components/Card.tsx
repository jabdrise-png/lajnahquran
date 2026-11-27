import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  id?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, id }) => {
  return (
    <div id={id} className={`card ${className}`}>
      {title && (
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">{title}</h2>
        </div>
      )}
      <div className="p-4 sm:p-5">
          {children}
      </div>
    </div>
  );
};

// Simplified card without title header for dashboard widgets
export const WidgetCard: React.FC<Pick<CardProps, 'children' | 'className'>> = ({ children, className = '' }) => {
    return (
        <div className={`card p-4 sm:p-5 ${className}`}>
            {children}
        </div>
    );
};


export default Card;