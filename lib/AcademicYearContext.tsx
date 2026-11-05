import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { AcademicYear } from '../types';
import { SupportSessionStore } from './permissions';

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  selectedAcademicYear: AcademicYear | null;
  setSelectedAcademicYear: (ay: AcademicYear | null) => void;
  loading: boolean;
  refreshAcademicYears: () => Promise<void>;
}

const AcademicYearContext = createContext<AcademicYearContextType>({
  academicYears: [],
  selectedAcademicYear: null,
  setSelectedAcademicYear: () => {},
  loading: true,
  refreshAcademicYears: async () => {},
});

export const useAcademicYear = () => useContext(AcademicYearContext);

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYear | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAY = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError && authError.message.includes('Refresh Token')) {
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', user.id)
        .single();

      const activeSupport = SupportSessionStore.getSession();
      const targetOrgId =
        (profile?.role === 'super_admin' || profile?.role === 'superadmin') && activeSupport?.organizationId
          ? activeSupport.organizationId
          : profile?.organization_id;

      if (targetOrgId) {
        const { data } = await supabase
          .from('academic_years')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('id', { ascending: false });

        if (data && data.length > 0) {
          setAcademicYears(data);
          setSelectedAcademicYear(prev => {
            if (!prev) return data.find(ay => ay.is_active) || data[0];
            const updated = data.find(ay => ay.id === prev.id);
            return updated || data.find(ay => ay.is_active) || data[0];
          });
        } else {
          setAcademicYears([]);
          setSelectedAcademicYear(null);
        }
      }
    } catch (e) {
      console.error("Error fetching academic year:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAY();
    const unsub = SupportSessionStore.subscribe(() => {
      fetchAY();
    });
    return () => unsub();
  }, []);

  return (
    <AcademicYearContext.Provider value={{ academicYears, selectedAcademicYear, setSelectedAcademicYear, loading, refreshAcademicYears: fetchAY }}>
      {children}
    </AcademicYearContext.Provider>
  );
};
