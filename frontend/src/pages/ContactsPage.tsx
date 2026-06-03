import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, Phone, MapPin, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';
import { toast } from '../stores/toastStore';

const CONTACT_TYPES = [
  { value: 'sub_dealer',   label: 'Sub-Dealer' },
  { value: 'retailer',     label: 'Retailer' },
  { value: 'side_market',  label: 'Side Market' },
  { value: 'employee',     label: 'Employee' },
];

const schema = z.object({
  type: z.enum(['sub_dealer', 'retailer', 'side_market', 'employee']),
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  area: z.string().optional(),
});
type ContactForm = z.infer<typeof schema>;

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', typeFilter, search],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '100' });
      if (typeFilter) p.set('type', typeFilter);
      if (search) p.set('search', search);
      return (await api.get(`/contacts?${p}`)).data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactForm>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'sub_dealer' },
  });

  const createMutation = useMutation({
    mutationFn: (d: ContactForm) => api.post('/contacts', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created!');
      setShowForm(false);
      reset();
    },
    onError: () => toast.error('Failed to create contact'),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">{data?.total ?? 0} active contacts</p>
        </div>
        <button id="add-contact-btn" className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Add Contact
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="contacts-search"
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            id="contacts-type-filter"
            className="form-select"
            style={{ width: 160 }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Contact Grid */}
      {isLoading ? (
        <div className="page-loader"><div className="spinner spinner-lg" /></div>
      ) : data?.data?.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {data.data.map((c: { id: string; name: string; type: string; phone?: string; address?: string; area?: string; outstanding_balance: number }) => (
            <div key={c.id} className="card" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span className={`badge badge-${c.type}`}>
                  {CONTACT_TYPES.find(t => t.value === c.type)?.label ?? c.type}
                </span>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>{c.name}</div>
              {c.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Phone size={12} />{c.phone}
                </div>
              )}
              {c.address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <MapPin size={12} />{c.address}
                </div>
              )}
              {c.outstanding_balance > 0 && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--danger)', fontWeight: 600 }}>
                  Due: ৳{Number(c.outstanding_balance).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={24} /></div>
          <div className="empty-state-title">No contacts found</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Add First Contact</button>
        </div>
      )}

      {/* Add Contact Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><Users size={18} /> Add Contact</div>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="new-contact-type">Type</label>
                  <select id="new-contact-type" className="form-select" {...register('type')}>
                    {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="new-contact-name">Full Name</label>
                  <input id="new-contact-name" className={`form-input ${errors.name ? 'error' : ''}`} placeholder="Full name" {...register('name')} />
                  {errors.name && <span className="form-error">{errors.name.message}</span>}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-contact-phone">Phone</label>
                    <input id="new-contact-phone" className="form-input" placeholder="+880..." {...register('phone')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-contact-area">Area</label>
                    <input id="new-contact-area" className="form-input" placeholder="Area/Zone" {...register('area')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-contact-address">Address</label>
                  <input id="new-contact-address" className="form-input" placeholder="Full address" {...register('address')} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" id="save-contact-btn" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
