import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, CheckCircle, XCircle, Package,
  User, Calendar, Tag, Hash, AlertCircle, ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceItem {
  id: string;
  product_name: string | null;
  line_total: number;
  damage_a: number | null;
  damage_b: number | null;
  free_items: number | null;
  commission: number | null;
  month_name: string | null;
  subscriber_address: string | null;
  running_bill: number | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  category: 'matador' | 'olympic' | 'bombay' | 'mtb_broadband';
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  rejection_reason: string | null;
  submitted_by_name: string;
  approved_by_name: string | null;
  approved_at: string | null;
  contact_name: string | null;
  subscriber_name: string | null;
  created_at: string;
  due_collections: number | null;
  collections_date: string | null;
  items: InvoiceItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  matador: 'Matador', olympic: 'Olympic', bombay: 'Bombay', mtb_broadband: 'MTB Broadband',
};
const CATEGORY_COLORS: Record<string, string> = {
  matador: 'matador', olympic: 'olympic', bombay: 'bombay', mtb_broadband: 'broadband',
};

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onCancel, loading }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><XCircle size={20} color="var(--danger)" /> Reject Invoice</h3>
        <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
          <label className="form-label required">Reason for rejection</label>
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="Explain why this invoice is being rejected..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger"
            disabled={!reason.trim() || loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? <span className="spinner" /> : <XCircle size={15} />}
            Reject Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}`);
      return res.data.data as Invoice;
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/invoices/${id}/approve`),
    onSuccess: () => {
      addToast('Invoice approved successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => addToast('Failed to approve invoice', 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.patch(`/invoices/${id}/reject`, { reason }),
    onSuccess: () => {
      addToast('Invoice rejected', 'warning');
      setShowRejectModal(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => addToast('Failed to reject invoice', 'error'),
  });

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalSales    = data?.items.reduce((s, i) => s + (i.line_total || 0), 0) ?? 0;
  const totalDamageA  = data?.items.reduce((s, i) => s + (i.damage_a  || 0), 0) ?? 0;
  const totalDamageB  = data?.items.reduce((s, i) => s + (i.damage_b  || 0), 0) ?? 0;
  const totalComm     = data?.items.reduce((s, i) => s + (i.commission || 0), 0) ?? 0;
  const totalFree     = data?.items.reduce((s, i) => s + (i.free_items || 0), 0) ?? 0;

  const fmt = (n: number) =>
    '৳ ' + n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="page-loader" style={{ height: '60vh' }}>
        <div className="spinner spinner-lg" />
        <span>Loading invoice...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="empty-state" style={{ height: '60vh' }}>
        <div className="empty-state-icon"><AlertCircle size={24} /></div>
        <div className="empty-state-title">Invoice not found</div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/invoices')}>
          <ArrowLeft size={14} /> Back to Invoices
        </button>
      </div>
    );
  }

  const isPending = data.status === 'pending';
  const isAdmin   = user?.role === 'admin';

  return (
    <>
      {showRejectModal && (
        <RejectModal
          loading={rejectMutation.isPending}
          onConfirm={(reason) => rejectMutation.mutate(reason)}
          onCancel={() => setShowRejectModal(false)}
        />
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button className="btn btn-ghost btn-sm" id="invoice-detail-back-btn" onClick={() => navigate('/invoices')}>
            <ArrowLeft size={15} /> Back
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 className="page-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem' }}>
                {data.invoice_number}
              </h1>
              <span className={`badge badge-${CATEGORY_COLORS[data.category]}`}>
                {CATEGORY_LABELS[data.category]}
              </span>
              <span className={`badge badge-${data.status}`}>{data.status}</span>
            </div>
            <p className="page-subtitle">
              Submitted on {format(new Date(data.created_at), 'dd MMM yyyy, hh:mm a')}
            </p>
          </div>
        </div>

        {/* Admin action buttons — only if pending */}
        {isAdmin && isPending && (
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              id="invoice-detail-reject-btn"
              className="btn btn-danger"
              onClick={() => setShowRejectModal(true)}
              disabled={approveMutation.isPending}
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              id="invoice-detail-approve-btn"
              className="btn btn-success"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <span className="spinner" /> : <CheckCircle size={15} />}
              Approve
            </button>
          </div>
        )}
      </div>

      {/* ── Info Cards ── */}
      <div className="grid-3 mb-4" style={{ marginBottom: 'var(--space-5)' }}>

        {/* Contact / Party */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <User size={13} /> Contact / Party
          </div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data.contact_name || data.subscriber_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
          </div>
        </div>

        {/* Submitted By */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Hash size={13} /> Submitted By
          </div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data.submitted_by_name}
          </div>
          {data.approved_by_name && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
              Approved by {data.approved_by_name}
              {data.approved_at && ` · ${format(new Date(data.approved_at), 'dd MMM yyyy')}`}
            </div>
          )}
        </div>

        {/* Notes / Rejection */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <ClipboardList size={13} /> {data.rejection_reason ? 'Rejection Reason' : 'Notes'}
          </div>
          <div style={{ fontSize: '0.875rem', color: data.rejection_reason ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {data.rejection_reason || data.notes || <span style={{ color: 'var(--text-muted)' }}>No notes</span>}
          </div>
        </div>
      </div>

      {/* ── MCT-Manual specific fields ── */}
      {(data.due_collections != null || data.collections_date != null) && (
        <div className="card mb-4" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-8)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
              Due Collections
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>
              {fmt(data.due_collections ?? 0)}
            </div>
          </div>
          {data.collections_date && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
                Collections Date
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {format(new Date(data.collections_date), 'dd MMM yyyy')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Line Items ── */}
      <div className="table-wrapper" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Package size={16} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Line Items</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {data.items.length} item{data.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {data.items.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
            <div className="empty-state-icon"><FileText size={20} /></div>
            <div className="empty-state-title">No line items</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product / Description</th>
                <th style={{ textAlign: 'right' }}>Line Total</th>
                <th style={{ textAlign: 'right' }}>Damage A</th>
                <th style={{ textAlign: 'right' }}>Damage B</th>
                <th style={{ textAlign: 'right' }}>Commission</th>
                <th style={{ textAlign: 'center' }}>Free</th>
                {data.category === 'mtb_broadband' && <th>Month</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ color: 'var(--text-muted)', width: 40 }}>{idx + 1}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {item.product_name || item.subscriber_address || '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)', fontWeight: 600 }}>
                    {item.line_total > 0 ? fmt(item.line_total) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: item.damage_a ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {item.damage_a ? fmt(item.damage_a) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: item.damage_b ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {item.damage_b ? fmt(item.damage_b) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: item.commission ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {item.commission ? fmt(item.commission) : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: item.free_items ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                    {item.free_items ?? '—'}
                  </td>
                  {data.category === 'mtb_broadband' && (
                    <td>{item.month_name || '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Totals Summary ── */}
      {data.items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div className="card" style={{ minWidth: 320, padding: 'var(--space-5)' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--space-4)', fontSize: '0.9375rem' }}>Summary</div>

            {[
              { label: 'Total Sales',  value: totalSales,   color: 'var(--success)' },
              { label: 'Damage A',     value: totalDamageA, color: 'var(--danger)',  hide: !totalDamageA },
              { label: 'Damage B',     value: totalDamageB, color: 'var(--danger)',  hide: !totalDamageB },
              { label: 'Commission',   value: totalComm,    color: 'var(--warning)', hide: !totalComm },
              { label: 'Free Items',   value: totalFree,    color: 'var(--accent-primary)', hide: !totalFree, isCount: true },
            ].filter(r => !r.hide).map(({ label, value, color, isCount }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
                  {isCount ? value : fmt(value)}
                </span>
              </div>
            ))}

            {/* Net total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Net Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                {fmt(totalSales - totalDamageA - totalDamageB - totalComm)}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
