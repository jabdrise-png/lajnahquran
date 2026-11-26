/**
 * Fase 3 · dialog alasan (koreksi/pembatalan). Aturan sama dengan fn_alasan_valid di server.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { cekAlasan } from '../../lib/pesanError';

interface Props {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (alasan: string) => void;
}

const AlasanDialog: React.FC<Props> = ({ isOpen, title, description, confirmLabel = 'Simpan', danger, busy, onCancel, onConfirm }) => {
  const [alasan, setAlasan] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setAlasan(''); setError(null); } }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="md">
      <div className="space-y-3">
        {description && <div className="text-sm text-slate-600">{description}</div>}
        <label className="block text-xs font-semibold text-slate-700">Alasan (wajib, minimal 5 karakter)</label>
        <textarea
          autoFocus
          rows={3}
          value={alasan}
          onChange={(e) => { setAlasan(e.target.value); setError(null); }}
          className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          placeholder="Contoh: Salah input, santri ternyata izin sakit"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const err = cekAlasan(alasan, 5);
              if (err) { setError(err); return; }
              onConfirm(alasan.trim());
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {busy ? 'Menyimpan…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Versi berbasis Promise: `const [dialog, mintaAlasan] = useMintaAlasan();`
 * lalu `const alasan = await mintaAlasan({ title })` → string, atau null bila dibatalkan.
 * Render `{dialog}` di dalam komponen.
 */
export function useMintaAlasan(): [React.ReactNode, (opts: { title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean }) => Promise<string | null>] {
  const [opts, setOpts] = useState<{ title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean } | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const minta = useCallback((o: { title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean }) =>
    new Promise<string | null>((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  const selesai = (v: string | null) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  const dialog = (
    <AlasanDialog
      isOpen={Boolean(opts)}
      title={opts?.title || ''}
      description={opts?.description}
      confirmLabel={opts?.confirmLabel}
      danger={opts?.danger}
      onCancel={() => selesai(null)}
      onConfirm={(a) => selesai(a)}
    />
  );
  return [dialog, minta];
}

export default AlasanDialog;
