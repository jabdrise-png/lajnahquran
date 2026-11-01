import React from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';

export const MarhalahLabel: React.FC<{ text: string, id?: string, className?: string }> = ({ text, id, className }) => {
    const { masterMarhalahs } = useSupabaseData();
    const resolvedName = id ? masterMarhalahs?.find((m: any) => m.id === id)?.nama || text : text;
    return <span className={className}>{resolvedName}</span>;
};

export const KelasLabel: React.FC<{ text: string, id?: string, className?: string }> = ({ text, id, className }) => {
    const { masterKelasRelasi } = useSupabaseData();
    const resolvedName = id ? masterKelasRelasi?.find((k: any) => k.id === id)?.nama_kelas || text : text;
    return <span className={className}>{resolvedName}</span>;
};
