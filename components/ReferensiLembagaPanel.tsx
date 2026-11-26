/**
 * Fase 2 · Pengaturan referensi lembaga (menggantikan daftar JSON di app_settings):
 *   - Jenis setoran (recitation_kinds) + penanda "menambah hafalan" / "dihitung murojaah"
 *   - Waktu halaqah (session_slots) + jenis setoran bawaan per waktu
 *   - Status kehadiran (attendance_statuses) + penanda "dihitung hadir" / "boleh setor"
 *   - Jenis halaqah (halaqah_types)
 * Hanya Admin yang bisa mengubah (dijaga RLS). Data yang sudah dipakai tidak bisa
 * dihapus, hanya dinonaktifkan (dijaga trigger database).
 */
import React, { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { NotificationStore } from '../lib/NotificationStore';
import { slug } from '../lib/v2Adapter';

type TableName = 'recitation_kinds' | 'session_slots' | 'attendance_statuses' | 'halaqah_types';

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
  const { recitationKinds, sessionSlots, attendanceStatuses, halaqahTypes, getOrgId, fetchData, userProfile } = useSupabaseData();
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(userProfile?.role || '').toLowerCase());
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState({ name: '', adds: false, murojaah: true });
  const [newSlot, setNewSlot] = useState({ name: '', kind: 'murojaah' });
  const [newStatus, setNewStatus] = useState({ name: '', present: false, recite: false });
  const [newType, setNewType] = useState('');

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
