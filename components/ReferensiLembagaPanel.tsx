/**
 * Fase 2 · Pengaturan referensi lembaga (menggantikan daftar JSON di app_settings):
 *   - Jenis setoran (recitation_kinds) + penanda "menambah hafalan" / "dihitung murojaah"
 *   - Waktu halaqah (session_slots) + jenis setoran bawaan per waktu
 *   - Status kehadiran (attendance_statuses) + penanda "dihitung hadir" / "boleh setor"
 *   - Jenis halaqah (halaqah_types)
 *   - Fase 3: Tabel Kelancaran (fluency_rules) — predikat otomatis dari khoto kabir/shoghir
 * Hanya Admin yang bisa mengubah (dijaga RLS). Data yang sudah dipakai tidak bisa
 * dihapus, hanya dinonaktifkan (dijaga trigger database).
 */
import React, { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { NotificationStore } from '../lib/NotificationStore';
import { slug } from '../lib/v2Adapter';
import { hitungPredikat } from '../lib/kelancaran';

type TableName = 'recitation_kinds' | 'session_slots' | 'attendance_statuses' | 'halaqah_types' | 'fluency_rules';

const inputCls =
  'w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({
  checked, onChange, label, disabled,
}) => (
  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
    <input type="checkbox" className="rounded border-slate-300" checked={checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Section: React.FC<{ title: string; hint: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="border border-slate-200 rounded-lg flex flex-col">
    <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
      <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
      <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
    </div>
    <div className="p-3 space-y-2">{children}</div>
  </div>
);

const ReferensiLembagaPanel: React.FC = () => {
  const { recitationKinds, sessionSlots, attendanceStatuses, halaqahTypes, fluencyRules, getOrgId, fetchData, userProfile } = useSupabaseData();
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(userProfile?.role || '').toLowerCase());
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState({ name: '', adds: false, murojaah: true });
  const [newSlot, setNewSlot] = useState({ name: '', kind: 'murojaah' });
  const [newStatus, setNewStatus] = useState({ name: '', present: false, recite: false });
  const [newType, setNewType] = useState('');
  const [newRule, setNewRule] = useState({ predicate: '', major: '0', minor: '0' });
  const [uji, setUji] = useState({ kabir: 0, shoghir: 0 });
  // Baris fluency_rules yang belum tersimpan di database (fallback bawaan) tidak punya id.
  const aturanTersimpan = fluencyRules.some((r) => r.id);
  const numOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0));

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.error) throw res.error;
      await fetchData();
      NotificationStore.addNotification(ok, 'success');
    } catch (e: any) {
      NotificationStore.addNotification(`Gagal: ${e?.message || e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const update = (table: TableName, id: string | undefined, patch: Record<string, any>) =>
    run(() => (supabase as any).from(table).update(patch).eq('id', id), 'Perubahan referensi disimpan.');

  const remove = (table: TableName, id: string | undefined, name: string) =>
    run(() => (supabase as any).from(table).delete().eq('id', id), `"${name}" dihapus.`);

  const insert = async (table: TableName, row: Record<string, any>, ok: string) => {
    const orgId = await getOrgId();
    return run(() => (supabase as any).from(table).insert({ ...row, organization_id: orgId }), ok);
  };

  const nextSort = (list: { sort_order?: number }[]) => Math.max(0, ...list.map((x) => Number(x.sort_order) || 0)) + 1;

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
      {busy && (
        <div className="xl:col-span-2 text-xs text-slate-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Menyimpan…
        </div>
      )}

      {/* Jenis setoran */}
      <Section
        title="Jenis Setoran"
        hint="Hanya jenis bertanda “Menambah hafalan” yang menambah total hafalan santri. Jenis yang sudah dipakai tidak bisa dihapus, cukup dinonaktifkan."
      >
        {recitationKinds.map((k) => (
          <div key={k.id || k.code} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <input className={`${inputCls} max-w-[180px]`} defaultValue={k.name} disabled={!isAdmin || busy}
              onBlur={(e) => e.target.value.trim() && e.target.value !== k.name && update('recitation_kinds', k.id, { name: e.target.value.trim() })} />
            <Toggle label="Menambah hafalan" checked={k.adds_memorization} disabled={!isAdmin || busy}
              onChange={(v) => update('recitation_kinds', k.id, { adds_memorization: v })} />
            <Toggle label="Dihitung murojaah" checked={k.counts_as_murojaah} disabled={!isAdmin || busy}
              onChange={(v) => update('recitation_kinds', k.id, { counts_as_murojaah: v })} />
            <Toggle label="Aktif" checked={k.is_active} disabled={!isAdmin || busy}
              onChange={(v) => update('recitation_kinds', k.id, { is_active: v })} />
            {isAdmin && !k.is_system && (
              <button type="button" title="Hapus" className="ml-auto text-slate-400 hover:text-red-500"
                onClick={() => remove('recitation_kinds', k.id, k.name)}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <input className={`${inputCls} max-w-[180px]`} placeholder="Jenis baru, mis. Tasmi'"
              value={newKind.name} onChange={(e) => setNewKind({ ...newKind, name: e.target.value })} />
            <Toggle label="Menambah hafalan" checked={newKind.adds} onChange={(v) => setNewKind({ ...newKind, adds: v })} />
            <Toggle label="Dihitung murojaah" checked={newKind.murojaah} onChange={(v) => setNewKind({ ...newKind, murojaah: v })} />
            <button type="button" disabled={!slug(newKind.name) || busy}
              className="bg-slate-800 hover:bg-slate-900 text-white h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-50"
              onClick={async () => {
                await insert('recitation_kinds', {
                  code: slug(newKind.name), name: newKind.name.trim(),
                  adds_memorization: newKind.adds, counts_as_murojaah: newKind.murojaah, sort_order: nextSort(recitationKinds),
                }, `Jenis setoran "${newKind.name.trim()}" ditambahkan.`);
                setNewKind({ name: '', adds: false, murojaah: true });
              }}><Plus size={16} /></button>
          </div>
        )}
      </Section>

      {/* Waktu halaqah */}
      <Section
        title="Waktu Halaqah"
        hint="Jenis setoran bawaan dipilih otomatis saat mencatat setoran di waktu tersebut. Kode waktu tidak bisa diganti; ubah labelnya saja."
      >
        {sessionSlots.map((sl) => (
          <div key={sl.id || sl.code} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <span className="text-[11px] font-mono text-slate-400 w-16 truncate" title="Kode">{sl.code}</span>
            <input className={`${inputCls} max-w-[140px]`} defaultValue={sl.name} disabled={!isAdmin || busy}
              onBlur={(e) => e.target.value.trim() && e.target.value !== sl.name && update('session_slots', sl.id, { name: e.target.value.trim() })} />
            <select className={`${inputCls} max-w-[150px]`} value={sl.default_kind_code || ''} disabled={!isAdmin || busy}
              onChange={(e) => update('session_slots', sl.id, { default_kind_code: e.target.value || null })}>
              <option value="">— Jenis bawaan —</option>
              {recitationKinds.filter((k) => k.is_active).map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
            </select>
            <input type="time" className={`${inputCls} max-w-[110px]`} defaultValue={sl.start_time?.slice(0, 5) || ''} disabled={!isAdmin || busy}
              onBlur={(e) => (e.target.value || null) !== (sl.start_time?.slice(0, 5) || null) && update('session_slots', sl.id, { start_time: e.target.value || null })} />
            <Toggle label="Aktif" checked={sl.is_active} disabled={!isAdmin || busy}
              onChange={(v) => update('session_slots', sl.id, { is_active: v })} />
            {isAdmin && (
              <button type="button" title="Hapus" className="ml-auto text-slate-400 hover:text-red-500"
                onClick={() => remove('session_slots', sl.id, sl.name)}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <input className={`${inputCls} max-w-[160px]`} placeholder="Waktu baru, mis. Dhuha"
              value={newSlot.name} onChange={(e) => setNewSlot({ ...newSlot, name: e.target.value })} />
            <select className={`${inputCls} max-w-[150px]`} value={newSlot.kind} onChange={(e) => setNewSlot({ ...newSlot, kind: e.target.value })}>
              {recitationKinds.filter((k) => k.is_active).map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
            </select>
            <button type="button" disabled={!newSlot.name.trim() || busy}
              className="bg-slate-800 hover:bg-slate-900 text-white h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-50"
              onClick={async () => {
                const name = newSlot.name.trim();
                await insert('session_slots', { code: name, name, default_kind_code: newSlot.kind, sort_order: nextSort(sessionSlots) },
                  `Waktu "${name}" ditambahkan.`);
                setNewSlot({ name: '', kind: 'murojaah' });
              }}><Plus size={16} /></button>
          </div>
        )}
      </Section>

      {/* Status kehadiran */}
      <Section
        title="Status Kehadiran"
        hint="“Dihitung hadir” dipakai persentase kehadiran. “Boleh setor” menentukan santri yang bisa dicatat setorannya pada sesi."
      >
        {attendanceStatuses.map((st) => (
          <div key={st.id || st.code} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <input className={`${inputCls} max-w-[150px]`} defaultValue={st.name} disabled={!isAdmin || busy}
              onBlur={(e) => e.target.value.trim() && e.target.value !== st.name && update('attendance_statuses', st.id, { name: e.target.value.trim() })} />
            <Toggle label="Dihitung hadir" checked={st.counts_as_present} disabled={!isAdmin || busy}
              onChange={(v) => update('attendance_statuses', st.id, { counts_as_present: v })} />
            <Toggle label="Boleh setor" checked={st.allows_recitation} disabled={!isAdmin || busy}
              onChange={(v) => update('attendance_statuses', st.id, { allows_recitation: v })} />
            <Toggle label="Aktif" checked={st.is_active} disabled={!isAdmin || busy}
              onChange={(v) => update('attendance_statuses', st.id, { is_active: v })} />
            {isAdmin && !st.is_system && (
              <button type="button" title="Hapus" className="ml-auto text-slate-400 hover:text-red-500"
                onClick={() => remove('attendance_statuses', st.id, st.name)}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <input className={`${inputCls} max-w-[150px]`} placeholder="Status baru"
              value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} />
            <Toggle label="Dihitung hadir" checked={newStatus.present} onChange={(v) => setNewStatus({ ...newStatus, present: v })} />
            <Toggle label="Boleh setor" checked={newStatus.recite} onChange={(v) => setNewStatus({ ...newStatus, recite: v })} />
            <button type="button" disabled={!slug(newStatus.name) || busy}
              className="bg-slate-800 hover:bg-slate-900 text-white h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-50"
              onClick={async () => {
                await insert('attendance_statuses', {
                  code: slug(newStatus.name), name: newStatus.name.trim(),
                  counts_as_present: newStatus.present, allows_recitation: newStatus.recite, sort_order: nextSort(attendanceStatuses),
                }, `Status "${newStatus.name.trim()}" ditambahkan.`);
                setNewStatus({ name: '', present: false, recite: false });
              }}><Plus size={16} /></button>
          </div>
        )}
      </Section>

      {/* Tabel Kelancaran (Fase 3) */}
      <Section
        title="Tabel Kelancaran"
        hint="Predikat dipilih otomatis: baris pertama (urut nomor) yang batas khoto kabir & shoghirnya terpenuhi. Selebihnya masuk baris “Ulang” (Rasib): setoran diulang dan tidak menambah hafalan. Predikat setoran lama tidak berubah saat tabel diubah."
      >
        {!aturanTersimpan && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            Tabel kelancaran lembaga belum tersimpan di database (migrasi 2026_11_28_01 belum dijalankan). Yang tampil adalah nilai bawaan.
          </p>
        )}
        <div className="grid grid-cols-[48px_1fr_72px_72px_auto] gap-2 text-[10px] font-semibold uppercase text-slate-400 px-0.5">
          <span>Urut</span><span>Predikat</span><span>Maks kabir</span><span>Maks shoghir</span><span />
        </div>
        {[...fluencyRules].sort((a, b) => a.sort_order - b.sort_order).map((r) => {
          const edit = isAdmin && !busy && Boolean(r.id);
          return (
            <div key={r.id || r.predicate} className="grid grid-cols-[48px_1fr_72px_72px_auto] gap-2 items-center py-1 border-b border-slate-100 last:border-0">
              <input type="number" min={1} className={inputCls} defaultValue={r.sort_order} disabled={!edit}
                onBlur={(e) => Number(e.target.value) !== r.sort_order && Number(e.target.value) > 0 && update('fluency_rules', r.id, { sort_order: Math.floor(Number(e.target.value)) })} />
              <input className={inputCls} defaultValue={r.predicate} disabled={!edit}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.predicate && update('fluency_rules', r.id, { predicate: e.target.value.trim() })} />
              {r.is_repeat ? (
                <span className="col-span-2 text-[11px] text-slate-500 italic">Selebihnya → diulang</span>
              ) : (
                <>
                  <input type="number" min={0} className={inputCls} defaultValue={r.max_major ?? ''} disabled={!edit}
                    onBlur={(e) => numOrNull(e.target.value) !== null && numOrNull(e.target.value) !== r.max_major && update('fluency_rules', r.id, { max_major: numOrNull(e.target.value) })} />
                  <input type="number" min={0} className={inputCls} defaultValue={r.max_minor ?? ''} disabled={!edit}
                    onBlur={(e) => numOrNull(e.target.value) !== null && numOrNull(e.target.value) !== r.max_minor && update('fluency_rules', r.id, { max_minor: numOrNull(e.target.value) })} />
                </>
              )}
              <div className="flex items-center gap-2">
                <Toggle label="Aktif" checked={r.is_active} disabled={!edit}
                  onChange={(v) => update('fluency_rules', r.id, { is_active: v })} />
                {edit && !r.is_repeat && (
                  <button type="button" title="Hapus" className="text-slate-400 hover:text-red-500"
                    onClick={() => remove('fluency_rules', r.id, r.predicate)}><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          );
        })}
        {isAdmin && aturanTersimpan && (
          <div className="grid grid-cols-[48px_1fr_72px_72px_auto] gap-2 items-center pt-2">
            <span className="text-[11px] text-slate-400 text-center">baru</span>
            <input className={inputCls} placeholder="Predikat baru" value={newRule.predicate}
              onChange={(e) => setNewRule({ ...newRule, predicate: e.target.value })} />
            <input type="number" min={0} className={inputCls} value={newRule.major} onChange={(e) => setNewRule({ ...newRule, major: e.target.value })} />
            <input type="number" min={0} className={inputCls} value={newRule.minor} onChange={(e) => setNewRule({ ...newRule, minor: e.target.value })} />
            <button type="button" disabled={!newRule.predicate.trim() || busy}
              className="bg-slate-800 hover:bg-slate-900 text-white h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-50"
              onClick={async () => {
                const nonUlang = fluencyRules.filter((r) => !r.is_repeat);
                await insert('fluency_rules', {
                  predicate: newRule.predicate.trim(),
                  max_major: numOrNull(newRule.major) ?? 0,
                  max_minor: numOrNull(newRule.minor) ?? 0,
                  sort_order: nextSort(nonUlang),
                  is_repeat: false,
                }, `Predikat "${newRule.predicate.trim()}" ditambahkan.`);
                setNewRule({ predicate: '', major: '0', minor: '0' });
              }}><Plus size={16} /></button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-600 border-t border-slate-100">
          <span className="font-semibold">Coba:</span>
          <label className="flex items-center gap-1">kabir
            <input type="number" min={0} className={`${inputCls} w-16`} value={uji.kabir} onChange={(e) => setUji({ ...uji, kabir: Number(e.target.value) || 0 })} />
          </label>
          <label className="flex items-center gap-1">shoghir
            <input type="number" min={0} className={`${inputCls} w-16`} value={uji.shoghir} onChange={(e) => setUji({ ...uji, shoghir: Number(e.target.value) || 0 })} />
          </label>
          {(() => {
            const h = hitungPredikat(fluencyRules, uji.kabir, uji.shoghir);
            return (
              <span className={`px-2 py-0.5 rounded-full font-semibold ${h.isRepeat ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {h.predicate}{h.isRepeat ? ' · diulang' : ''}
              </span>
            );
          })()}
        </div>
      </Section>

      {/* Jenis halaqah */}
      <Section title="Jenis Halaqah" hint="Pilihan jenis saat membuat halaqah.">
        {halaqahTypes.map((t) => (
          <div key={t.id || t.name} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <input className={`${inputCls} max-w-[220px]`} defaultValue={t.name} disabled={!isAdmin || busy}
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && update('halaqah_types', t.id, { name: e.target.value.trim() })} />
            <Toggle label="Aktif" checked={t.is_active} disabled={!isAdmin || busy}
              onChange={(v) => update('halaqah_types', t.id, { is_active: v })} />
            {isAdmin && (
              <button type="button" title="Hapus" className="ml-auto text-slate-400 hover:text-red-500"
                onClick={() => remove('halaqah_types', t.id, t.name)}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <input className={`${inputCls} max-w-[220px]`} placeholder="Jenis halaqah baru" value={newType} onChange={(e) => setNewType(e.target.value)} />
            <button type="button" disabled={!newType.trim() || busy}
              className="bg-slate-800 hover:bg-slate-900 text-white h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-50"
              onClick={async () => {
                await insert('halaqah_types', { name: newType.trim(), sort_order: nextSort(halaqahTypes) }, `Jenis halaqah "${newType.trim()}" ditambahkan.`);
                setNewType('');
              }}><Plus size={16} /></button>
          </div>
        )}
      </Section>
    </div>
  );
};

export default ReferensiLembagaPanel;
