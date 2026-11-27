import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Eye, Search } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { PageShell, PageHeader, StatCard, StatusBadge, EmptyState } from '../../components/ui/SaaSPrimitives';
import Modal from '../../components/Modal';

export const AuditLembagaPage: React.FC = () => {
  const { getOrgId, orgName, santri, selectedAcademicYear } = useSupabaseData();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [reportCards, setReportCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'audit' | 'raport'>('audit');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const orgId = await getOrgId();
      if (orgId) {
        try {
          const { data: logs } = await (supabase as any)
            .from('audit_logs')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(150);
          if (logs) setAuditLogs(logs);
        } catch {
          setAuditLogs([]);
        }

        try {
          const { data: rCards } = await (supabase as any)
            .from('report_cards')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(150);
          if (rCards) setReportCards(rCards);
        } catch {
          setReportCards([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedAcademicYear?.id]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter((log) => {
      const action = String(log.action || '').toLowerCase();
      const resType = String(log.resource_type || log.entity_type || '').toLowerCase();
      const reason = String(log.reason || '').toLowerCase();
      return action.includes(q) || resType.includes(q) || reason.includes(q);
    });
  }, [auditLogs, searchQuery]);

  const filteredReportCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reportCards;
    return reportCards.filter((rc) => {
      const sId = rc.santri_id || rc.student_id;
      const student = santri.find((s) => Number(s.id) === Number(sId));
      const snap = rc.snapshot_json || {};
      const name = String(student?.nama || snap.santri_nama || '').toLowerCase();
      const sem = String(rc.semester_name || snap.semester || '').toLowerCase();
      const reason = String(rc.amendment_reason || '').toLowerCase();
      return name.includes(q) || sem.includes(q) || reason.includes(q);
    });
  }, [reportCards, santri, searchQuery]);

  return (
    <PageShell>
      <PageHeader
                title="Audit Perubahan Data & Arsip Raport"
        description={`Pantau seluruh aktivitas sensitif (koreksi absensi, review setoran, penerbitan target/rubrik, penutupan tahun) serta arsip raport yang sudah terbit di ${orgName || 'Lembaga'}.`}
        actions={
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Muat Ulang
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Jejak Audit Lembaga"
          value={auditLogs.length}
          meta="Log mutasi sensitif & koreksi"
          tone="primary"
        />
        <StatCard
          label="Raport diterbitkan"
          value={reportCards.filter((r) => r.status === 'published').length}
          meta="Raport terbit yang tersimpan"
          tone="success"
        />
        <StatCard
          label="Riwayat Revisi Raport"
          value={reportCards.filter((r) => (Number(r.version_no) || 1) > 1 || r.status === 'amended').length}
          meta="Revisi pasca-terbit beralasan"
          tone="warning"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="tabs">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`tab ${activeTab === 'audit' ? 'tab-aktif' : ''}`}
          >
            Log Aktivitas & Koreksi ({filteredLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('raport')}
            className={`tab ${activeTab === 'raport' ? 'tab-aktif' : ''}`}
          >
            Arsip raport ({filteredReportCards.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari aksi, santri, atau alasan audit..."
            className="kontrol kontrol-cari"
          />
        </div>
      </div>

      {activeTab === 'audit' ? (
        filteredLogs.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Belum Ada Log Audit"
              description="Setiap perubahan nilai ujian, koreksi absensi pasca-simpan, review setoran, dan publikasi versi target/rubrik akan tercatat otomatis di sini."
            />
          </div>
        ) : (
          <div className="wadah-tabel overflow-x-auto">
            <table className="tabel tabel-kartu">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aksi</th>
                  <th>Entitas</th>
                  <th>Alasan / Keterangan</th>
                  <th className="text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const resType = log.resource_type || log.entity_type || '-';
                  const resId = log.resource_id || log.entity_id || '';
                  const reasonText =
                    log.reason ||
                    log.after_state?.reason ||
                    log.diff_json?.reason ||
                    log.diff_json?.note ||
                    '-';
                  return (
                    <tr key={log.id}>
                      <td data-label="Waktu" className="text-slate-500 tabular-nums whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : '-'}
                      </td>
                      <td data-label="Aksi">
                        <StatusBadge label={String(log.action || 'MUTASI').toUpperCase()} tone="primary" />
                      </td>
                      <td data-label="Entitas" className="font-mono text-slate-700">
                        {resType}
                        {resId ? <span className="text-slate-400 ml-1">({String(resId).slice(0, 16)})</span> : null}
                      </td>
                      <td data-label="Alasan" className="text-slate-700 max-w-md truncate">
                        {reasonText}
                      </td>
                      <td data-label="Detail" className="text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedAuditLog(log)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Eye size={13} /> Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        filteredReportCards.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Belum ada raport diterbitkan"
              description="Raport yang diterbitkan dari halaman Rekap Nilai & Raport akan tercatat di sini."
            />
          </div>
        ) : (
          <div className="wadah-tabel overflow-x-auto">
            <table className="tabel tabel-kartu">
              <thead>
                <tr>
                  <th>Santri</th>
                  <th>Semester</th>
                  <th>Versi</th>
                  <th>Nilai Akhir & Predikat</th>
                  <th>Status</th>
                  <th>Catatan Revisi</th>
                  <th className="text-right">Arsip Terbit</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportCards.map((rc) => {
                  const sId = rc.santri_id || rc.student_id;
                  const student = santri.find((s) => Number(s.id) === Number(sId));
                  const snap = rc.snapshot_json || {};
                  const finalScore = rc.final_score ?? snap.final_score ?? '-';
                  const predikat = rc.predikat || snap.predikat || '-';
                  return (
                    <tr key={rc.id}>
                      <td data-label="Santri" className="font-semibold text-slate-900">
                        <div>{student?.nama || snap.santri_nama || `Santri #${sId}`}</div>
                        <div className="text-2xs font-normal text-slate-500">
                          {snap.marhalah || student?.marhalah || '-'} • Kelas {snap.kelas || student?.kelas || '-'}
                        </div>
                      </td>
                      <td data-label="Semester" className="font-medium text-slate-700">
                        {rc.semester_name || snap.semester || 'Ganjil'}
                      </td>
                      <td data-label="Versi" className="font-bold text-slate-800 tabular-nums">
                        v{rc.version_no || 1}
                      </td>
                      <td data-label="Nilai Akhir" className="font-bold text-slate-900 tabular-nums">
                        {finalScore} <span className="text-slate-500 font-sans font-semibold">({predikat})</span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={rc.status === 'published' ? 'Terbit' : rc.status === 'amended' ? 'Direvisi' : String(rc.status || 'Terbit')}
                          tone={rc.status === 'published' ? 'success' : 'warning'}
                        />
                      </td>
                      <td data-label="Catatan" className="text-slate-600 max-w-xs truncate">
                        {rc.amendment_reason || 'Terbit awal'}
                      </td>
                      <td data-label="Arsip" className="text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSnapshot(rc)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Eye size={13} /> Lihat Data
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {selectedSnapshot && (
        <Modal
          isOpen={!!selectedSnapshot}
          onClose={() => setSelectedSnapshot(null)}
          title={`Arsip raport v${selectedSnapshot.version_no || 1}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <div className="text-slate-400 font-semibold">Santri</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedSnapshot.snapshot_json?.santri_nama || `ID #${selectedSnapshot.santri_id}`}
                </div>
              </div>
              <div>
                <div className="text-slate-400 font-semibold">Semester</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedSnapshot.semester_name || selectedSnapshot.snapshot_json?.semester || '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 font-semibold">Nilai Akhir</div>
                <div className="font-bold font-mono text-slate-900 mt-0.5">
                  {selectedSnapshot.final_score ?? selectedSnapshot.snapshot_json?.final_score ?? '-'} (
                  {selectedSnapshot.predikat || selectedSnapshot.snapshot_json?.predikat || '-'})
                </div>
              </div>
              <div>
                <div className="text-slate-400 font-semibold">Dibekukan Pada</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  {selectedSnapshot.published_at
                    ? new Date(selectedSnapshot.published_at).toLocaleString('id-ID')
                    : '-'}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5">Data arsip (JSON)</div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-2xs font-mono overflow-x-auto max-h-80">
                {JSON.stringify(selectedSnapshot.snapshot_json || {}, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {selectedAuditLog && (
        <Modal
          isOpen={!!selectedAuditLog}
          onClose={() => setSelectedAuditLog(null)}
          title={`Detail Jejak Audit — ${selectedAuditLog.action}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div>
                <span className="font-semibold text-slate-500">Waktu: </span>
                <span className="font-mono text-slate-800">
                  {selectedAuditLog.created_at ? new Date(selectedAuditLog.created_at).toLocaleString('id-ID') : '-'}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Entitas: </span>
                <span className="font-mono text-slate-800">
                  {selectedAuditLog.resource_type || selectedAuditLog.entity_type} ({selectedAuditLog.resource_id || '-'})
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Alasan Audit: </span>
                <span className="font-bold text-slate-900">{selectedAuditLog.reason || '-'}</span>
              </div>
            </div>
            {selectedAuditLog.before_state && (
              <div>
                <div className="font-bold text-slate-700 mb-1">Data Sebelum</div>
                <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-2xs font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(selectedAuditLog.before_state, null, 2)}
                </pre>
              </div>
            )}
            {(selectedAuditLog.after_state || selectedAuditLog.diff_json) && (
              <div>
                <div className="font-bold text-slate-700 mb-1">Data Sesudah / Perubahan</div>
                <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-2xs font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(selectedAuditLog.after_state || selectedAuditLog.diff_json, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageShell>
  );
};

export default AuditLembagaPage;
