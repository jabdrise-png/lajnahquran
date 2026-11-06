import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { AcademicYear } from '../types';
import { SupportSessionStore, resolveTenantContext } from './permissions';

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  selectedAcademicYear: AcademicYear | null;
  activeAcademicYear: AcademicYear | null;
  isArchivedView: boolean;
  setSelectedAcademicYear: (ay: AcademicYear | null) => void;
  openArchivedYear: (yearId: number) => void;
  returnToActiveYear: () => void;
  loading: boolean;
  error: string | null;
  refreshAcademicYears: () => Promise<void>;
}

const AcademicYearContext = createContext<AcademicYearContextType>({
  academicYears: [],
  selectedAcademicYear: null,
  activeAcademicYear: null,
  isArchivedView: false,
  setSelectedAcademicYear: () => {},
  openArchivedYear: () => {},
  returnToActiveYear: () => {},
  loading: true,
  error: null,
  refreshAcademicYears: async () => {},
});

export const useAcademicYear = () => useContext(AcademicYearContext);

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYear | null>(null);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAY = useCallback(async () => {
    setError(null);
    try {
      const ctx = await resolveTenantContext(supabase);
      if (!ctx.userId || !ctx.isAuthorized || !ctx.organizationId) {
        setAcademicYears([]);
        setSelectedAcademicYear(null);
        setActiveAcademicYear(null);
        setLoading(false);
        return;
      }

      const targetOrgId = ctx.organizationId;

      if (targetOrgId) {
        const { data, error: ayErr } = await supabase
          .from('academic_years')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('id', { ascending: false });

        if (ayErr) {
          setError(`Gagal memuat daftar Tahun Ajaran: ${ayErr.message}`);
          setAcademicYears([]);
        } else if (data && data.length > 0) {
          setAcademicYears(data);
          const active = data.find(ay => ay.is_active) || data[0] || null;
          setActiveAcademicYear(active);
          setSelectedAcademicYear(prev => {
            if (!prev) return active;
            const updated = data.find(ay => ay.id === prev.id);
            return updated || active;
          });
        } else {
          setAcademicYears([]);
          setSelectedAcademicYear(null);
          setActiveAcademicYear(null);
        }
      }
    } catch (e: any) {
      console.error("Error fetching academic year:", e);
      setError(e?.message || 'Gagal memuat Tahun Ajaran');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAY();
    const unsub = SupportSessionStore.subscribe(() => {
      fetchAY();
    });
    return () => unsub();
  }, [fetchAY]);

  const openArchivedYear = useCallback((yearId: number) => {
    const target = academicYears.find(ay => ay.id === yearId);
    if (target) {
      setSelectedAcademicYear(target);
    }
  }, [academicYears]);

  const returnToActiveYear = useCallback(() => {
    if (activeAcademicYear) {
      setSelectedAcademicYear(activeAcademicYear);
    }
  }, [activeAcademicYear]);

  const isArchivedView = Boolean(
    selectedAcademicYear &&
    (!selectedAcademicYear.is_active ||
      selectedAcademicYear.status === 'closed' ||
      selectedAcademicYear.lifecycle_status === 'closed')
  );

  return (
    <AcademicYearContext.Provider
      value={{
        academicYears,
        selectedAcademicYear,
        activeAcademicYear,
        isArchivedView,
        setSelectedAcademicYear,
        openArchivedYear,
        returnToActiveYear,
        loading,
        error,
        refreshAcademicYears: fetchAY,
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};
