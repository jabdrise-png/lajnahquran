import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { StatusBadge } from '../components/ui/SaaSPrimitives';

const VerifyReportPage: React.FC = () => {
  const { code: routeCode } = useParams<{ code?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialCode = routeCode || searchParams.get('code') || '';
  const [inputCode, setInputCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);

  const runVerification = async (codeToVerify: string) => {
    const clean = codeToVerify.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('rpc_verify_report_card', {
        p_code: clean,
      });
      if (error) {
        setVerificationResult({
          valid: false,
          message: error.message || 'Gagal memverifikasi kode raport.',
        });
      } else {
        setVerificationResult(data || { valid: false, message: 'Kode verifikasi tidak ditemukan.' });
      }
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        message: err?.message || 'Layanan verifikasi sedang tidak dapat diakses.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      setInputCode(initialCode);
      runVerification(initialCode);
    }
  }, [initialCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    navigate(`/verify/${encodeURIComponent(inputCode.trim())}`, { replace: true });
    runVerification(inputCode.trim());
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Verifikasi Keaslian Dokumen Akademik
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Verifikasi Snapshot Raport Resmi
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              Masukkan Kode Verifikasi Raport (contoh: <span className="font-mono">LQ-1A2B3C4D5E6F</span>) atau
              Hash SHA-256 yang tertera pada dokumen Raport Tahfidz untuk memeriksa keaslian dan integritas data.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Masukkan Kode Verifikasi (LQ-...) atau Hash SHA-256"
              className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={loading || !inputCode.trim()}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Memeriksa...' : 'Verifikasi Dokumen'}
            </button>
          </form>
        </div>

        {verificationResult && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-5">
            {verificationResult.valid ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Status Integritas Snapshot</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      Dokumen Raport Terverifikasi & Sah
                    </div>
                  </div>
                  <StatusBadge
                    label={
                      verificationResult.status === 'published'
                        ? `TERBIT RESMI (v${verificationResult.version_no || 1})`
                        : `VERSI TERDAHULU (${String(verificationResult.status || '').toUpperCase()} v${verificationResult.version_no || 1})`
                    }
                    tone={verificationResult.status === 'published' ? 'success' : 'warning'}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">Nama Santri</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {verificationResult.santri_nama || '-'}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {verificationResult.marhalah || '-'} · Kelas {verificationResult.kelas || '-'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">Lembaga / Ma'had</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {verificationResult.organization_name || '-'}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      TA {verificationResult.academic_year || '-'} · Semester {verificationResult.semester_name || '-'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">Nilai Akhir & Predikat</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5 tabular-nums">
                      {verificationResult.final_score ?? '-'} ({verificationResult.predikat || '-'})
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Total Hafalan: {verificationResult.total_hafalan || '-'} Juz
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">Kode & Waktu Penerbitan</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {verificationResult.verification_code || '-'}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {verificationResult.published_at
                        ? new Date(verificationResult.published_at).toLocaleString('id-ID')
                        : '-'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900 text-slate-100 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Jejak Kriptografi Snapshot (SHA-256 Immutable Hash)
                  </div>
                  <div className="font-mono text-xs break-all">
                    {verificationResult.snapshot_hash || '-'}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <StatusBadge label="TIDAK TERVERIFIKASI" tone="danger" />
                <div className="text-base font-bold text-slate-900">
                  Dokumen Tidak Ditemukan
                </div>
                <p className="text-xs text-slate-600">
                  {verificationResult.message ||
                    'Kode verifikasi atau hash yang dimasukkan tidak terdaftar pada buku besar raport resmi.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyReportPage;
