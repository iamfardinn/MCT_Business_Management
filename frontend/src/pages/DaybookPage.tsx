import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Filter, Plus, Pencil, Copy, Trash2, X,
  ChevronDown, Settings, Download, Printer, ExternalLink,
  ArrowUpDown, Eye, EyeOff,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import { useNavigate } from 'react-router-dom';
import type { DaybookEntry, DaybookResponse } from '@mct/shared';

// ─── Constants ───────────────────────────────────────────────────────────────

const VOUCHER_TYPES   = ['Receipt', 'Payment', 'Contra', 'Journal', 'Sales', 'Purchase'];
const CREATABLE_TYPES = ['Receipt', 'Payment', 'Contra', 'Journal'];

const VTYPE_COLOR: Record<string, string> = {
  Receipt: 'var(--success)',
  Sales:   'var(--accent-primary)',
  Payment: 'var(--danger)',
  Purchase:'var(--warning)',
  Contra:  'var(--brand-broadband)',
  Journal: 'var(--text-secondary)',
};

const today = () => format(new Date(), 'yyyy-MM-dd');

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoucherDraft {
  id?: string;
  source?: string;
  entry_date: string;
  voucher_type: string;
  debit_ledger: string;
  credit_ledger: string;
  amount: string;
  narration: string;
}

interface DaybookConfig {
  showNarration:    boolean;
  showDetailed:     boolean;
  showRunBal:       boolean;
  showSource:       boolean;
  sortAsc:          boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, compact = false): string => {
  if (n == null || n === 0) return compact ? '—' : '0.00';
  return Number(n).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtCcy = (n: number | null | undefined): string => {
  if (!n) return '—';
  return `৳\u202f${fmt(n)}`;
};

function groupByDate(entries: DaybookEntry[]): Map<string, DaybookEntry[]> {
  const map = new Map<string, DaybookEntry[]>();
  for (const e of entries) {
    const d = e.entry_date.substring(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  return map;
}

// ─── Toggle switch component ──────────────────────────────────────────────────

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label className="db-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="db-toggle-track" />
      <span className="db-toggle-thumb" />
    </label>
  );
}

// ─── Configure Drawer (F12) ───────────────────────────────────────────────────

function ConfigureDrawer({
  config, onConfig, onClose,
}: {
  config: DaybookConfig;
  onConfig: (c: DaybookConfig) => void;
  onClose: () => void;
}) {
  const set = (k: keyof DaybookConfig, v: boolean) => onConfig({ ...config, [k]: v });

  return (
    <>
      <div className="db-configure-overlay" onClick={onClose} />
      <aside className="db-configure-drawer" role="dialog" aria-label="Configure Daybook">
        <div className="db-configure-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} /> F12: Configure
          </span>
          <button className="db-action-btn" onClick={onClose} aria-label="Close configure"><X size={16} /></button>
        </div>

        <div className="db-configure-body">
          <div className="db-configure-section">Display Options</div>

          <div className="db-toggle-row">
            <div>
              <div className="db-toggle-label">Detailed View (Alt+F1)</div>
              <div className="db-toggle-sublabel">Show Dr / Cr legs separately</div>
            </div>
            <Toggle id="cfg-detailed" checked={config.showDetailed} onChange={v => set('showDetailed', v)} />
          </div>

          <div className="db-toggle-row">
            <div>
              <div className="db-toggle-label">Show Narration</div>
              <div className="db-toggle-sublabel">Display narration below each entry</div>
            </div>
            <Toggle id="cfg-narr" checked={config.showNarration} onChange={v => set('showNarration', v)} />
          </div>

          <div className="db-toggle-row">
            <div>
              <div className="db-toggle-label">Running Balance</div>
              <div className="db-toggle-sublabel">Cumulative balance per row</div>
            </div>
            <Toggle id="cfg-runbal" checked={config.showRunBal} onChange={v => set('showRunBal', v)} />
          </div>

          <div className="db-toggle-row">
            <div>
              <div className="db-toggle-label">Source Badge</div>
              <div className="db-toggle-sublabel">Show cashbook / invoice / expense</div>
            </div>
            <Toggle id="cfg-source" checked={config.showSource} onChange={v => set('showSource', v)} />
          </div>

          <div className="db-configure-section" style={{ marginTop: 8 }}>Sort Order</div>

          <div className="db-toggle-row">
            <div>
              <div className="db-toggle-label">Oldest First</div>
              <div className="db-toggle-sublabel">Chronological (Tally default)</div>
            </div>
            <Toggle id="cfg-sort" checked={config.sortAsc} onChange={v => set('sortAsc', v)} />
          </div>

          <div className="db-configure-section" style={{ marginTop: 8 }}>Keyboard Shortcuts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Ins',  'New Voucher'],
              ['F2',   'Change period (focus From date)'],
              ['F4',   'Filter voucher type'],
              ['Del',  'Delete selected voucher'],
              ['Esc',  'Close modal / drawer'],
              ['Alt+F1','Toggle Detailed View'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="db-shortcut">{key}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Voucher Modal ────────────────────────────────────────────────────────────

function VoucherModal({ draft, onClose, onSaved }: {
  draft: VoucherDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit     = !!draft.id;
  const isInvoice  = draft.source === 'invoice';
  const isExpense  = draft.source === 'expense';
  const [form, setForm] = useState<VoucherDraft>(draft);
  const set = (k: keyof VoucherDraft, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Auto-focus amount on open
  const amtRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => amtRef.current?.focus(), 80); }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body: Record<string, unknown> = {
          source:     form.source,
          entry_date: form.entry_date,
          narration:  form.narration,
          amount: form.amount === '' ? undefined : Number(form.amount),
        };
        if (!isInvoice) {
          body.voucher_type  = form.voucher_type;
          body.debit_ledger  = form.debit_ledger;
          body.credit_ledger = form.credit_ledger;
        }
        return api.patch(`/daybook/${form.id}`, body);
      }
      return api.post('/daybook', {
        entry_date:   form.entry_date,
        voucher_type: form.voucher_type,
        debit_ledger: form.debit_ledger,
        credit_ledger:form.credit_ledger,
        amount:       Number(form.amount),
        narration:    form.narration,
      });
    },
    onSuccess: () => { toast.success(isEdit ? 'Voucher updated' : 'Voucher created'); onSaved(); onClose(); },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isInvoice && !isExpense) {
      if (!form.debit_ledger.trim() || !form.credit_ledger.trim()) { toast.error('Both ledgers required'); return; }
      if (form.debit_ledger.trim() === form.credit_ledger.trim())   { toast.error('Ledgers must differ'); return; }
      if (!form.amount || Number(form.amount) <= 0)                 { toast.error('Amount must be > 0'); return; }
    }
    mutation.mutate();
  }

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const voucherTypeColor = VTYPE_COLOR[form.voucher_type] || 'var(--text-secondary)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>

        {/* Modal Title */}
        <div className="modal-title" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <BookOpen size={18} color={voucherTypeColor} />
          <span>
            {isEdit
              ? (isInvoice ? 'Edit Invoice Voucher' : isExpense ? 'Edit Expense (read-only)' : 'Edit Voucher')
              : 'New Voucher'}
          </span>
          {form.voucher_type && (
            <span className={`vtype-badge vtype-${form.voucher_type}`} style={{ marginLeft: 8 }}>
              {form.voucher_type}
            </span>
          )}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {isExpense && (
          <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
            Expense vouchers are read-only here. Edit from the Expenses page.
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {/* Date + Type */}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label required" htmlFor="v-date">Date</label>
                <input id="v-date" type="date" className="form-input" value={form.entry_date}
                  onChange={e => set('entry_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="v-type">Voucher Type</label>
                <select id="v-type" className="form-select" value={form.voucher_type}
                  disabled={isInvoice || isExpense}
                  onChange={e => set('voucher_type', e.target.value)}>
                  {(isInvoice || isExpense ? VOUCHER_TYPES : CREATABLE_TYPES).map(v =>
                    <option key={v} value={v}>{v}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Dr / Cr Ledgers — Tally-style side by side */}
            {!isInvoice && !isExpense && (
              <div className="db-modal-ledger-row">
                <div className="db-ledger-input-wrapper">
                  <span className="db-ledger-label dr">DR</span>
                  <input className="form-input" id="v-debit" placeholder="Debit Ledger"
                    value={form.debit_ledger} onChange={e => set('debit_ledger', e.target.value)}
                    style={{ borderColor: form.debit_ledger ? 'rgba(34,197,94,0.4)' : undefined }} />
                </div>
                <div className="db-modal-ledger-sep">⇆</div>
                <div className="db-ledger-input-wrapper">
                  <span className="db-ledger-label cr">CR</span>
                  <input className="form-input" id="v-credit" placeholder="Credit Ledger"
                    value={form.credit_ledger} onChange={e => set('credit_ledger', e.target.value)}
                    style={{ borderColor: form.credit_ledger ? 'rgba(239,68,68,0.4)' : undefined }} />
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="form-group">
              <label className="form-label required" htmlFor="v-amount">Amount (৳)</label>
              <input
                id="v-amount" ref={amtRef}
                type="number" step="0.01" className="form-input"
                placeholder="0.00" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 700 }}
              />
              {isInvoice && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Leave blank to keep the current invoice total.
                </span>
              )}
            </div>

            {/* Narration */}
            <div className="form-group">
              <label className="form-label" htmlFor="v-narration">Narration</label>
              <textarea id="v-narration" className="form-textarea" placeholder="Optional note or description..."
                value={form.narration} onChange={e => set('narration', e.target.value)} rows={2} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" id="save-voucher-btn" className="btn btn-primary"
              disabled={mutation.isPending || isExpense}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Voucher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DaybookPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Filter state
  const [from, setFrom]           = useState(format(new Date(), 'yyyy-MM-01'));
  const [to,   setTo]             = useState(today());
  const [voucherType, setVType]   = useState('');
  const [page, setPage]           = useState(1);

  // ── UI state
  const [config, setConfig] = useState<DaybookConfig>({
    showNarration: true,
    showDetailed:  false,
    showRunBal:    true,
    showSource:    true,
    sortAsc:       true,
  });
  const [showCfg,    setShowCfg]     = useState(false);
  const [modalDraft, setModalDraft]  = useState<VoucherDraft | null>(null);
  const [collapsed,  setCollapsed]   = useState<Set<string>>(new Set());
  const [selected,   setSelected]    = useState<string | null>(null);

  // Refs for keyboard shortcuts
  const fromRef  = useRef<HTMLInputElement>(null);
  const vtypeRef = useRef<HTMLSelectElement>(null);

  // ── Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);

      if (e.key === 'Insert' || e.key === 'Ins') { e.preventDefault(); setModalDraft(blankDraft()); return; }
      if (e.key === 'F2')  { e.preventDefault(); fromRef.current?.focus(); return; }
      if (e.key === 'F4')  { e.preventDefault(); vtypeRef.current?.focus(); return; }
      if (e.key === 'F12') { e.preventDefault(); setShowCfg(s => !s); return; }
      if (e.altKey && e.key === 'F1') { e.preventDefault(); setConfig(c => ({ ...c, showDetailed: !c.showDetailed })); return; }
      if (e.key === 'Escape') { setShowCfg(false); setModalDraft(null); setSelected(null); return; }
      if (e.key === 'Delete' && !inInput && selected) { confirmDelete(selected); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  const blankDraft = (): VoucherDraft => ({
    entry_date: today(), voucher_type: 'Payment',
    debit_ledger: '', credit_ledger: '', amount: '', narration: '',
  });

  // ── Data fetch
  const { data, isLoading } = useQuery<DaybookResponse>({
    queryKey: ['daybook', from, to, voucherType, page, config.sortAsc],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '500', sort: config.sortAsc ? 'asc' : 'desc' });
      if (from) p.set('from', from);
      if (to)   p.set('to',   to);
      if (voucherType) p.set('voucher_type', voucherType);
      return (await api.get(`/daybook?${p}`)).data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['daybook'] });

  // ── Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/daybook/${id}`),
    onSuccess: () => { toast.success('Voucher deleted'); refresh(); setSelected(null); },
    onError: (err: unknown) =>
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Delete failed'),
  });

  const confirmDelete = useCallback((id: string) => {
    if (confirm('Delete this voucher? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  }, [deleteMutation]);

  // ── Excel export
  async function handleExport() {
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to)   p.set('to',   to);
      if (voucherType) p.set('voucher_type', voucherType);
      const response = await api.get(`/daybook/export?${p}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MCT-Daybook-${from || 'all'}-${to || 'all'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel file downloaded!');
    } catch {
      toast.error('Export failed');
    }
  }

  // ── Edit / duplicate helpers
  function editEntry(e: DaybookEntry) {
    setModalDraft({
      id: e.id, source: e.source,
      entry_date:   format(parseISO(e.entry_date.substring(0, 10)), 'yyyy-MM-dd'),
      voucher_type:  e.voucher_type,
      debit_ledger:  e.debit_ledger  ?? '',
      credit_ledger: e.credit_ledger ?? '',
      amount: String(e.debit_amount || e.credit_amount || ''),
      narration: e.narration ?? '',
    });
  }

  function duplicateEntry(e: DaybookEntry) {
    setModalDraft({
      entry_date: today(),
      voucher_type:  CREATABLE_TYPES.includes(e.voucher_type) ? e.voucher_type : 'Journal',
      debit_ledger:  e.debit_ledger  ?? '',
      credit_ledger: e.credit_ledger ?? '',
      amount: String(e.debit_amount || e.credit_amount || ''),
      narration: e.narration ?? '',
    });
  }

  function toggleCollapse(dateKey: string) {
    setCollapsed(s => {
      const next = new Set(s);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  // ── Derived data
  const totals  = data?.totals;
  const entries = data?.data ?? [];
  const grouped = groupByDate(entries);

  // Compute running balance per row (client-side, from opening balance)
  const runBalMap = new Map<string, number>();
  let runBal = totals?.opening_balance ?? 0;
  for (const e of (config.sortAsc ? entries : [...entries].reverse())) {
    runBal += (parseFloat(String(e.debit_amount)) || 0) - (parseFloat(String(e.credit_amount)) || 0);
    runBalMap.set(e.id, runBal);
  }

  // Columns count (for colSpan on date headers)
  const colCount = 5 + (config.showRunBal ? 1 : 0) + (config.showSource ? 1 : 0) + 1; // +1 for actions

  // ── Reset filters
  function resetFilters() { setFrom(format(new Date(),'yyyy-MM-01')); setTo(today()); setVType(''); setPage(1); }

  // ── Formatting helpers
  const fmtEntry = (n: number | null | undefined) => n ? fmt(n) : '—';

  // ── Closing balance color
  const closingBal  = totals?.closing_balance ?? 0;
  const openingBal  = totals?.opening_balance ?? 0;

  return (
    <div>
      {/* ─── Print Header (hidden on screen) ─── */}
      <div className="db-print-header">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>MCT Group — Daybook</h2>
        <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: '4px 0' }}>
          Period: {from || 'Beginning'} → {to || 'Present'}
          {voucherType ? ` | ${voucherType} Vouchers` : ''}
        </p>
        <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
          Printed: {format(new Date(), 'dd MMM yyyy, hh:mm a')}
        </p>
        <hr style={{ marginTop: 8 }} />
      </div>

      {/* ─── Page Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={22} color="var(--accent-primary)" /> Daybook
          </h1>
          <p className="page-subtitle">
            Tally-style journal · {data?.total ?? 0} entries
            {from && to && ` · ${format(parseISO(from), 'dd MMM')} – ${format(parseISO(to), 'dd MMM yyyy')}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button id="new-voucher-btn" className="btn btn-primary" onClick={() => setModalDraft(blankDraft())}>
            <Plus size={15} /> New Voucher <span className="db-shortcut-hint">Ins</span>
          </button>
        </div>
      </div>

      {/* ─── Tally-style Toolbar (F2/F4/F12 bar) ─── */}
      <div className="db-toolbar">
        {/* Period (F2) */}
        <div className="db-toolbar-group">
          <span className="db-period-label">Period <span className="db-shortcut-hint">[F2]</span></span>
          <input
            ref={fromRef}
            id="daybook-from"
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            title="From date"
          />
          <span className="db-period-label">→</span>
          <input
            id="daybook-to"
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            title="To date"
          />
        </div>

        <div className="db-toolbar-sep" />

        {/* Voucher Type (F4) */}
        <div className="db-toolbar-group">
          <span className="db-period-label">Voucher <span className="db-shortcut-hint">[F4]</span></span>
          <select
            ref={vtypeRef}
            id="daybook-vtype"
            value={voucherType}
            onChange={e => { setVType(e.target.value); setPage(1); }}
          >
            <option value="">All Vouchers</option>
            {VOUCHER_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="db-toolbar-sep" />

        {/* Actions */}
        <div className="db-toolbar-group" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters} title="Reset filters">
            <Filter size={13} /> Reset
          </button>
          <button
            id="configure-btn"
            className={`btn btn-secondary btn-sm ${showCfg ? 'btn-primary' : ''}`}
            onClick={() => setShowCfg(s => !s)}
            title="F12: Configure"
          >
            <Settings size={13} /> Configure <span className="db-shortcut-hint">[F12]</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Export to Excel" id="export-daybook-btn">
            <Download size={13} /> Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()} title="Print">
            <Printer size={13} /> Print
          </button>
          <button
            className={`btn btn-ghost btn-sm`}
            onClick={() => setConfig(c => ({ ...c, showDetailed: !c.showDetailed }))}
            title="Alt+F1: Toggle Detailed View"
          >
            {config.showDetailed ? <EyeOff size={13} /> : <Eye size={13} />}
            {config.showDetailed ? 'Summary' : 'Detailed'}
            <span className="db-shortcut-hint">[Alt+F1]</span>
          </button>
        </div>
      </div>

      {/* ─── Summary Stat Cards ─── */}
      <div className="db-stats-row">
        <div className="db-stat opening">
          <span className="db-stat-label">Opening Balance</span>
          <span className="db-stat-value">৳{fmt(openingBal)}</span>
        </div>
        <div className="db-stat debit">
          <span className="db-stat-label">Total Debit (In)</span>
          <span className="db-stat-value">৳{fmt(totals?.total_debit)}</span>
        </div>
        <div className="db-stat credit">
          <span className="db-stat-label">Total Credit (Out)</span>
          <span className="db-stat-value">৳{fmt(totals?.total_credit)}</span>
        </div>
        <div className={`db-stat closing ${closingBal < 0 ? 'negative' : ''}`}>
          <span className="db-stat-label">Closing Balance</span>
          <span className="db-stat-value">৳{fmt(closingBal)}</span>
        </div>
      </div>

      {/* ─── Main Daybook Table ─── */}
      <div className="db-table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-10)' }}>
            <div className="spinner spinner-lg" />
            <span>Loading daybook…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-12)' }}>
            <div className="empty-state-icon"><BookOpen size={24} /></div>
            <div className="empty-state-title">No daybook entries found</div>
            <p style={{ fontSize: '0.875rem' }}>Adjust the date range or voucher type filter</p>
            <button className="btn btn-primary btn-sm" onClick={() => setModalDraft(blankDraft())}>
              <Plus size={13} /> Create First Voucher
            </button>
          </div>
        ) : (
          <table className="db-table">
            <colgroup>
              <col style={{ width: 100 }} />  {/* Date */}
              <col />                          {/* Particulars */}
              <col style={{ width: 108 }} />  {/* Vch Type */}
              <col style={{ width: 130 }} />  {/* Vch No */}
              {config.showSource && <col style={{ width: 80 }} />}
              <col style={{ width: 120 }} />  {/* Debit */}
              <col style={{ width: 120 }} />  {/* Credit */}
              {config.showRunBal && <col style={{ width: 128 }} />} {/* Balance */}
              <col style={{ width: 90 }} />   {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Vch Type</th>
                <th>Vch No</th>
                {config.showSource && <th>Source</th>}
                <th className="text-right">Debit (৳)</th>
                <th className="text-right">Credit (৳)</th>
                {config.showRunBal && <th className="text-right">Balance (৳)</th>}
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance pseudo-row */}
              {openingBal !== 0 && (
                <tr className="db-opening-row">
                  <td colSpan={colCount} style={{ textAlign: 'right', paddingRight: 'var(--space-3)' }}>
                    Opening Balance&nbsp;&nbsp;
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      ৳{fmt(openingBal)}
                    </span>
                  </td>
                </tr>
              )}

              {/* Date-grouped rows */}
              {Array.from(grouped.entries()).map(([dateKey, dayEntries]) => {
                const isCollapsed = collapsed.has(dateKey);
                const dayDr  = dayEntries.reduce((s, e) => s + (parseFloat(String(e.debit_amount))  || 0), 0);
                const dayCr  = dayEntries.reduce((s, e) => s + (parseFloat(String(e.credit_amount)) || 0), 0);
                const dayLabel = format(parseISO(dateKey), 'EEEE, dd MMMM yyyy');

                return (
                  <>
                    {/* Date header row */}
                    <tr
                      key={`date-${dateKey}`}
                      className={`db-date-header ${isCollapsed ? 'collapsed' : ''}`}
                      onClick={() => toggleCollapse(dateKey)}
                    >
                      <td colSpan={colCount}>
                        <span className="collapse-icon">
                          <ChevronDown size={13} />
                        </span>
                        {dayLabel}
                        <span style={{ float: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          {dayEntries.length} voucher{dayEntries.length !== 1 ? 's' : ''}
                          &nbsp;·&nbsp;Dr&nbsp;<span style={{ color: 'var(--success)' }}>৳{fmt(dayDr, true)}</span>
                          &nbsp;|&nbsp;Cr&nbsp;<span style={{ color: 'var(--danger)' }}>৳{fmt(dayCr, true)}</span>
                        </span>
                      </td>
                    </tr>

                    {/* Entry rows (hidden when collapsed) */}
                    {!isCollapsed && dayEntries.map(e => {
                      const dr  = parseFloat(String(e.debit_amount))  || 0;
                      const cr  = parseFloat(String(e.credit_amount)) || 0;
                      const bal = runBalMap.get(e.id) ?? 0;
                      const isManual  = e.source === 'cashbook' && !!e.voucher_group;
                      const canDelete = e.source === 'cashbook' && !!e.voucher_group;
                      const isInvSrc  = e.source === 'invoice';
                      const isExpSrc  = e.source === 'expense';
                      const isSelected = selected === e.id;

                      return (
                        <>
                          {/* Main entry row */}
                          <tr
                            key={`entry-${e.id}`}
                            className={`db-entry-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelected(s => s === e.id ? null : e.id)}
                          >
                            {/* Date */}
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.775rem', whiteSpace: 'nowrap' }}>
                              {format(parseISO(dateKey), 'dd MMM')}
                            </td>

                            {/* Particulars */}
                            <td className="db-particulars">
                              <div className="db-particulars-main">
                                {config.showDetailed ? (
                                  <>
                                    <span className="db-dr-label">DR</span>
                                    {e.debit_ledger || e.particulars || '—'}
                                  </>
                                ) : (
                                  e.particulars || e.debit_ledger || '—'
                                )}
                              </div>
                              {config.showDetailed && e.credit_ledger && (
                                <div className="db-particulars-sub">
                                  <span className="db-cr-label">CR</span>
                                  {e.credit_ledger}
                                </div>
                              )}
                            </td>

                            {/* Voucher Type */}
                            <td>
                              <span className={`vtype-badge vtype-${e.voucher_type}`}>
                                {e.voucher_type}
                              </span>
                            </td>

                            {/* Voucher No */}
                            <td className="db-vno">{e.voucher_no || '—'}</td>

                            {/* Source */}
                            {config.showSource && (
                              <td>
                                <span className={`db-source-badge db-source-${e.source}`}>
                                  {e.source}
                                </span>
                              </td>
                            )}

                            {/* Debit */}
                            <td className={`db-amount ${dr > 0 ? 'debit' : 'muted'}`}>
                              {dr > 0 ? fmt(dr) : '—'}
                            </td>

                            {/* Credit */}
                            <td className={`db-amount ${cr > 0 ? 'credit' : 'muted'}`}>
                              {cr > 0 ? fmt(cr) : '—'}
                            </td>

                            {/* Running Balance */}
                            {config.showRunBal && (
                              <td className={`db-amount balance ${bal < 0 ? 'negative' : ''}`}>
                                {fmt(bal)}
                              </td>
                            )}

                            {/* Actions */}
                            <td style={{ textAlign: 'center' }}>
                              {isExpSrc ? (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Edit from the Expenses page">—</span>
                              ) : (
                                <div className="db-row-actions">
                                  <button className="db-action-btn" title="Edit" onClick={ev => { ev.stopPropagation(); editEntry(e); }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button className="db-action-btn" title="Duplicate" onClick={ev => { ev.stopPropagation(); duplicateEntry(e); }}>
                                    <Copy size={12} />
                                  </button>
                                  {isInvSrc && (
                                    <button className="db-action-btn success" title="View Invoice" onClick={ev => { ev.stopPropagation(); navigate(`/invoices/${e.id}`); }}>
                                      <ExternalLink size={12} />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button className="db-action-btn danger" title="Delete (Del)" onClick={ev => { ev.stopPropagation(); confirmDelete(e.id); }}>
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Detailed Dr/Cr rows */}
                          {config.showDetailed && (e.debit_ledger || e.credit_ledger) && !isExpSrc && (
                            <>
                              {e.debit_ledger && (
                                <tr key={`dr-${e.id}`} className="db-detail-row dr">
                                  <td />
                                  <td colSpan={2} style={{ paddingLeft: 'calc(var(--space-3) + 28px)' }}>
                                    <span className="db-dr-label">DR</span>
                                    {e.debit_ledger}
                                  </td>
                                  <td colSpan={config.showSource ? 2 : 1} />
                                  <td className="db-amount debit" style={{ paddingLeft: 0 }}>{fmt(dr)}</td>
                                  <td />
                                  {config.showRunBal && <td />}
                                  <td />
                                </tr>
                              )}
                              {e.credit_ledger && (
                                <tr key={`cr-${e.id}`} className="db-detail-row cr">
                                  <td />
                                  <td colSpan={2} style={{ paddingLeft: 'calc(var(--space-3) + 28px)' }}>
                                    <span className="db-cr-label">CR</span>
                                    {e.credit_ledger}
                                  </td>
                                  <td colSpan={config.showSource ? 2 : 1} />
                                  <td />
                                  <td className="db-amount credit">{fmt(cr)}</td>
                                  {config.showRunBal && <td />}
                                  <td />
                                </tr>
                              )}
                            </>
                          )}

                          {/* Narration row */}
                          {config.showNarration && e.narration && (
                            <tr key={`narr-${e.id}`} className="db-narration-row">
                              <td />
                              <td colSpan={colCount - 1} style={{ fontStyle: 'italic', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                ↳ {e.narration}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}

                    {/* Day subtotal row */}
                    {!isCollapsed && (
                      <tr key={`sub-${dateKey}`} className="db-subtotal-row">
                        <td colSpan={config.showSource ? 5 : 4} style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.7rem' }}>
                          Day Total
                        </td>
                        <td className="db-amount debit">{fmt(dayDr)}</td>
                        <td className="db-amount credit">{fmt(dayCr)}</td>
                        {config.showRunBal && <td />}
                        <td />
                      </tr>
                    )}
                  </>
                );
              })}

              {/* ─── Grand Total row ─── */}
              <tr className="db-grand-total">
                <td colSpan={config.showSource ? 5 : 4} style={{ textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.8rem' }}>
                  Grand Total
                </td>
                <td className="db-amount debit" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9375rem' }}>
                  {fmt(totals?.total_debit)}
                </td>
                <td className="db-amount credit" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9375rem' }}>
                  {fmt(totals?.total_credit)}
                </td>
                {config.showRunBal && (
                  <td className={`db-amount balance ${closingBal < 0 ? 'negative' : ''}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9375rem' }}>
                    {fmt(closingBal)}
                  </td>
                )}
                <td />
              </tr>

              {/* Closing balance row */}
              <tr className="db-grand-total" style={{ borderTop: 'none' }}>
                <td colSpan={colCount} style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', paddingTop: 0 }}>
                  Closing Balance:&nbsp;
                  <span style={{ fontFamily: 'var(--font-mono)', color: closingBal >= 0 ? 'var(--accent-primary)' : 'var(--danger)' }}>
                    ৳{fmt(closingBal)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Pagination ─── */}
      {data && data.total > data.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Page {page} of {Math.ceil(data.total / data.limit)}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* ─── Configure Drawer (F12) ─── */}
      {showCfg && (
        <ConfigureDrawer
          config={config}
          onConfig={setConfig}
          onClose={() => setShowCfg(false)}
        />
      )}

      {/* ─── Voucher Modal ─── */}
      {modalDraft && (
        <VoucherModal
          draft={modalDraft}
          onClose={() => setModalDraft(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
