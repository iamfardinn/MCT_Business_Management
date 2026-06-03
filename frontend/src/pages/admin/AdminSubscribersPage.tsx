import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wifi, Plus, Search, MapPin, Phone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().min(1, 'Address is required'),
  area_group: z.string().optional(),
  monthly_bill: z.coerce.number().min(0),
  connection_date: z.string().optional(),
});
type SubForm = z.infer<typeof schema>;

export default function AdminSubscribersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['subscribers', search, statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '100' });
      if (statusFilter) p.set('status', statusFilter);
      if (search) p.set('search', search);
      return (await api.get(`/subscribers?${p}`)).data;
    },
  });

  const { data: dueList } = useQuery({
    queryKey: ['subscribers', 'due-list'],
    queryFn: async () => (await api.get('/subscribers/due-list')).data.data,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SubForm>({
    resolver: zodResolver(schema),
    defaultValues: { monthly_bill: 0 },
  });

  const createMutation = useMutation({
    mutationFn: (d: SubForm) => api.post('/subscribers', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      toast.success('Subscriber added!');
      setShowForm(false);
      reset();
    },
    onError: () => toast.error('Failed to add subscriber'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/subscribers/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscribers'] }),
  });

  const fmt = (n: number | null) => `৳${Number(n ?? 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Broadband Subscribers</h1>
          <p className="page-subtitle">{data?.total ?? 0} subscribers · {dueList?.length ?? 0} with outstanding balance</p>
        </div>
        <button id="add-subscriber-btn" className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Add Subscriber
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="subscribers-search"
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Search by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            id="subscribers-status-filter"
            className="form-select"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-8)' }}><div className="spinner spinner-lg" /></div>
        ) : data?.data?.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Area / Group</th>
                <th>Monthly Bill</th>
                <th>Running Balance</th>
                <th>Status</th>
                <th>Connected</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((s: { id: string; name: string; phone?: string; address: string; area_group?: string; monthly_bill: number; running_balance: number; status: string; connection_date?: string }) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={10} />{s.address}
                    </div>
                  </td>
                  <td>{s.phone ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{s.phone}</span> : '—'}</td>
                  <td>{s.area_group || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.monthly_bill)}</td>
                  <td style={{ fontWeight: 700, color: s.running_balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {fmt(s.running_balance)}
                  </td>
                  <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                  <td>{s.connection_date ? format(new Date(s.connection_date), 'dd MMM yyyy') : '—'}</td>
                  <td>
                    <button
                      id={`toggle-sub-${s.id}`}
                      className={`btn btn-sm ${s.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                      style={s.status !== 'active' ? { background: 'var(--success)', color: '#fff' } : {}}
                      onClick={() => toggleMutation.mutate({ id: s.id, status: s.status === 'active' ? 'inactive' : 'active' })}
                    >
                      {s.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><Wifi size={24} /></div>
            <div className="empty-state-title">No subscribers found</div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><Wifi size={18} /> Add Subscriber</div>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label required" htmlFor="sub-name">Full Name</label>
                    <input id="sub-name" className={`form-input ${errors.name ? 'error' : ''}`} placeholder="Subscriber name" {...register('name')} />
                    {errors.name && <span className="form-error">{errors.name.message}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-phone">Phone</label>
                    <input id="sub-phone" className="form-input" placeholder="+880..." {...register('phone')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="sub-address">Address</label>
                  <input id="sub-address" className={`form-input ${errors.address ? 'error' : ''}`} placeholder="Full address" {...register('address')} />
                  {errors.address && <span className="form-error">{errors.address.message}</span>}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-area">Area / Group</label>
                    <input id="sub-area" className="form-input" placeholder="e.g. Zone A" {...register('area_group')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label required" htmlFor="sub-bill">Monthly Bill (৳)</label>
                    <input id="sub-bill" type="number" step="0.01" className={`form-input ${errors.monthly_bill ? 'error' : ''}`} placeholder="0.00" {...register('monthly_bill')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="sub-date">Connection Date</label>
                  <input id="sub-date" type="date" className="form-input" {...register('connection_date')} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" id="save-subscriber-btn" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Saving...' : 'Add Subscriber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
