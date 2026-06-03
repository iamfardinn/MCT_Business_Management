import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Send, ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import type { InvoiceCategory } from '@mct/shared';

// ─── Validation Schemas ───────────────────────────────────────────

const productItemSchema = z.object({
  product_name: z.string().min(1, 'Product name required'),
  line_total: z.coerce.number().min(0),
  damage_a: z.coerce.number().optional(),
  damage_b: z.coerce.number().optional(),
  free_items: z.coerce.number().int().optional(),
  commission: z.coerce.number().optional(),
});

const broadbandItemSchema = z.object({
  month_name: z.string().min(1, 'Month is required'),
  subscriber_address: z.string().min(1, 'Address required'),
  running_bill: z.coerce.number().min(0),
  subscriber_id: z.string().optional(),
});

const schema = z.object({
  category: z.enum(['matador', 'olympic', 'bombay', 'mtb_broadband']),
  contact_id: z.string().optional(),
  subscriber_id: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.union([productItemSchema, broadbandItemSchema])).min(1),
});

type FormValues = z.infer<typeof schema>;

const CATEGORIES: { value: InvoiceCategory; label: string; color: string }[] = [
  { value: 'matador',       label: '🔴 Matador Group',    color: 'var(--brand-matador)' },
  { value: 'olympic',       label: '🟡 Olympic Group',    color: 'var(--brand-olympic)' },
  { value: 'bombay',        label: '🟢 Bombay Group',     color: 'var(--brand-bombay)' },
  { value: 'mtb_broadband', label: '🟣 MTB Broadband',    color: 'var(--brand-broadband)' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function emptyProductItem() {
  return { product_name: '', line_total: 0, damage_a: undefined, damage_b: undefined, free_items: undefined, commission: undefined };
}
function emptyBroadbandItem() {
  return { month_name: '', subscriber_address: '', running_bill: 0, subscriber_id: undefined };
}

export default function InvoiceNewPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<InvoiceCategory>('matador');

  const { register, handleSubmit, control, formState: { errors }, watch, setValue, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'matador',
      items: [emptyProductItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await api.get('/contacts?limit=200')).data.data,
  });

  const { data: subscribers } = useQuery({
    queryKey: ['subscribers'],
    queryFn: async () => (await api.get('/subscribers?status=active&limit=200')).data.data,
    enabled: category === 'mtb_broadband',
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => api.post('/invoices', data),
    onSuccess: () => {
      toast.success('Invoice submitted for approval!');
      navigate('/invoices');
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Submission failed');
    },
  });

  function handleCategoryChange(val: InvoiceCategory) {
    setCategory(val);
    setValue('category', val);
    setValue('items', val === 'mtb_broadband' ? [emptyBroadbandItem()] : [emptyProductItem()]);
  }

  const isBroadband = category === 'mtb_broadband';

  const items = watch('items') as Record<string, unknown>[];
  const totalAmount = items.reduce((sum, item) => sum + (Number((item as { line_total?: number }).line_total) || Number((item as { running_bill?: number }).running_bill) || 0), 0);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 'var(--space-2)' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="page-title">New Invoice</h1>
          <p className="page-subtitle">Create and submit an invoice for admin approval</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate>

        {/* ─── Category Selection ─────────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header">
            <div className="card-title">Invoice Category</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                id={`category-${c.value}`}
                onClick={() => handleCategoryChange(c.value)}
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${category === c.value ? c.color : 'var(--border-subtle)'}`,
                  background: category === c.value ? `${c.color}15` : 'var(--bg-elevated)',
                  color: category === c.value ? c.color : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: category === c.value ? 700 : 500,
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  transition: 'all var(--transition)',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Contact / Subscriber ───────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header">
            <div className="card-title">Customer Details</div>
          </div>
          <div className="form-grid-2">
            {!isBroadband ? (
              <div className="form-group">
                <label className="form-label" htmlFor="contact-select">Contact (Optional)</label>
                <select id="contact-select" className="form-select" {...register('contact_id')}>
                  <option value="">— Select a contact —</option>
                  {contacts?.map((c: { id: string; name: string; type: string }) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="subscriber-select">Subscriber (Optional)</label>
                <select id="subscriber-select" className="form-select" {...register('subscriber_id')}>
                  <option value="">— Select subscriber —</option>
                  {subscribers?.map((s: { id: string; name: string; area_group?: string }) => (
                    <option key={s.id} value={s.id}>{s.name} {s.area_group ? `(${s.area_group})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="invoice-notes">Notes</label>
              <input id="invoice-notes" className="form-input" placeholder="Optional notes..." {...register('notes')} />
            </div>
          </div>
        </div>

        {/* ─── Line Items ──────────────────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header">
            <div className="card-title">{isBroadband ? 'Billing Lines' : 'Product Lines'}</div>
            <button
              type="button"
              id="add-line-item-btn"
              className="btn btn-secondary btn-sm"
              onClick={() => append(isBroadband ? emptyBroadbandItem() : emptyProductItem())}
            >
              <Plus size={14} /> Add Line
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {fields.map((field, idx) => (
              <div
                key={field.id}
                style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', border: '1px solid var(--border-subtle)', position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Line {idx + 1}
                  </span>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {!isBroadband ? (
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label required">Product Name</label>
                      <input className="form-input" placeholder="e.g. Cement 50kg" {...register(`items.${idx}.product_name` as `items.${number}.product_name`)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Line Total (৳)</label>
                      <input type="number" step="0.01" className="form-input" placeholder="0.00" {...register(`items.${idx}.line_total` as `items.${number}.line_total`)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Damage A (৳)</label>
                      <input type="number" step="0.01" className="form-input" placeholder="0.00" {...register(`items.${idx}.damage_a` as `items.${number}.damage_a`)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Damage B (৳)</label>
                      <input type="number" step="0.01" className="form-input" placeholder="0.00" {...register(`items.${idx}.damage_b` as `items.${number}.damage_b`)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Free Items</label>
                      <input type="number" className="form-input" placeholder="0" {...register(`items.${idx}.free_items` as `items.${number}.free_items`)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Commission (৳)</label>
                      <input type="number" step="0.01" className="form-input" placeholder="0.00" {...register(`items.${idx}.commission` as `items.${number}.commission`)} />
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label required">Month</label>
                      <select className="form-select" {...register(`items.${idx}.month_name` as `items.${number}.month_name`)}>
                        <option value="">Select month</option>
                        {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Running Bill (৳)</label>
                      <input type="number" step="0.01" className="form-input" placeholder="0.00" {...register(`items.${idx}.running_bill` as `items.${number}.running_bill`)} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label required">Subscriber Address</label>
                      <input className="form-input" placeholder="Full subscriber address" {...register(`items.${idx}.subscriber_address` as `items.${number}.subscriber_address`)} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL AMOUNT</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                ৳{totalAmount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Actions ─────────────────────────────────────────────── */}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button
            type="submit"
            id="submit-invoice-btn"
            className="btn btn-primary"
            disabled={mutation.isPending}
          >
            <Send size={15} />
            {mutation.isPending ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </div>
  );
}
