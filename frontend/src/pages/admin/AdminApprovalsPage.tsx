import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, CheckCircle, XCircle, FileText, TrendingDown, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';

export default function AdminApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectModal, setRejectModal] = useState<{ id: string; type: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['approvals', page],
    queryFn: async () => (await api.get(`/approvals?page=${page}&limit=20`)).data,
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      api.patch(`/${type}s/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Approved successfully!');
    },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, type, reason }: { id: string; type: string; reason: string }) =>
      api.patch(`/${type}s/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Rejected.');
      setRejectModal(null);
      setRejectReason('');
    },
    onError: () => toast.error('Failed to reject'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      api.delete(`/${type}s/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Record deleted permanently.');
    },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">
            {data?.total ?? 0} pending submissions •&nbsp;
            <span className="live-indicator" style={{ display: 'inline-flex' }}>
              <span className="live-dot" /> Live
            </span>
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => refetch()} id="refresh-approvals-btn">
          Refresh
        </button>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-8)' }}>
            <div className="spinner spinner-lg" />
            <span>Loading approval queue...</span>
          </div>
        ) : data?.data?.length > 0 ? (
          <>
            {data.data.map((item: {
              id: string; record_type: string; ref_number: string;
              category?: string; submitted_by_name: string;
              description?: string; amount?: number; created_at: string;
            }) => (
              <div key={item.id} className="approval-item">
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: item.record_type === 'invoice' ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.record_type === 'invoice' ? 'var(--accent-primary)' : 'var(--warning)', flexShrink: 0 }}>
                  {item.record_type === 'invoice' ? <FileText size={18} /> : <TrendingDown size={18} />}
                </div>

                <div className="approval-info">
                  <div className="approval-title">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>{item.ref_number}</span>
                    &nbsp;·&nbsp;
                    <span style={{ textTransform: 'capitalize' }}>{item.record_type}</span>
                    {item.category && <>&nbsp;·&nbsp;<span style={{ textTransform: 'capitalize' }}>{item.category.replace('_', ' ')}</span></>}
                  </div>
                  <div className="approval-meta">
                    Submitted by <strong style={{ color: 'var(--text-secondary)' }}>{item.submitted_by_name}</strong>
                    &nbsp;·&nbsp;{format(new Date(item.created_at), 'dd MMM yyyy, hh:mm a')}
                    {item.amount && <>&nbsp;·&nbsp;<strong style={{ color: 'var(--warning)' }}>৳{Number(item.amount).toLocaleString()}</strong></>}
                    {item.description && <>&nbsp;·&nbsp;{item.description}</>}
                  </div>
                </div>

                <div className="approval-actions">
                  <button
                    id={`approve-btn-${item.id}`}
                    className="btn btn-success btn-sm"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ id: item.id, type: item.record_type })}
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button
                    id={`reject-btn-${item.id}`}
                    className="btn btn-warning btn-sm"
                    onClick={() => setRejectModal({ id: item.id, type: item.record_type })}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    id={`delete-btn-${item.id}`}
                    className="btn btn-danger btn-sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => { if(confirm('Are you sure you want to permanently delete this submission?')) deleteMutation.mutate({ id: item.id, type: item.record_type }); }}
                    title="Delete permanently"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-12)' }}>
            <div className="empty-state-icon"><CheckSquare size={28} /></div>
            <div className="empty-state-title">No pending submissions</div>
            <p className="text-sm">All submissions have been reviewed!</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Page {page}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ color: 'var(--danger)' }}><XCircle size={18} /> Reject Submission</div>
            <p style={{ marginBottom: 'var(--space-4)', fontSize: '0.875rem' }}>
              Please provide a reason for rejection. The employee will be notified.
            </p>
            <div className="form-group">
              <label className="form-label required" htmlFor="reject-reason">Rejection Reason</label>
              <textarea
                id="reject-reason"
                className="form-textarea"
                placeholder="e.g. Incorrect amount, missing documentation..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
              <button
                id="confirm-reject-btn"
                className="btn btn-danger"
                style={{ background: 'var(--danger)', color: '#fff' }}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectModal.id, type: rejectModal.type, reason: rejectReason })}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
