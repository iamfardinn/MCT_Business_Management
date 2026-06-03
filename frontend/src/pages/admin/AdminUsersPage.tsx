import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, Shield, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';

const schema = z.object({
  username: z.string().min(3, 'At least 3 chars').max(50),
  password: z.string().min(8, 'At least 8 chars'),
  full_name: z.string().min(1),
  role: z.enum(['admin', 'employee']),
});
type UserForm = z.infer<typeof schema>;

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.data,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserForm>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'employee' },
  });

  const createMutation = useMutation({
    mutationFn: (d: UserForm) => api.post('/users', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created!');
      setShowForm(false);
      reset();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(msg);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/users/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User status updated');
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">{data?.length ?? 0} system accounts</p>
        </div>
        <button id="add-user-btn" className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Add User
        </button>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-8)' }}><div className="spinner spinner-lg" /></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((u: { id: string; full_name: string; username: string; role: string; is_active: boolean; created_at: string }) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--brand-broadband))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {u.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>{u.username}</td>
                  <td>
                    <span className="badge" style={{ color: u.role === 'admin' ? 'var(--brand-broadband)' : 'var(--text-secondary)', background: u.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(100,116,139,0.1)', borderColor: u.role === 'admin' ? 'rgba(139,92,246,0.3)' : 'rgba(100,116,139,0.3)' }}>
                      {u.role === 'admin' ? <Shield size={11} /> : <User size={11} />}
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${u.is_active ? 'active' : 'inactive'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{format(new Date(u.created_at), 'dd MMM yyyy')}</td>
                  <td>
                    <button
                      id={`toggle-user-${u.id}`}
                      className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                      style={u.is_active ? {} : { background: 'var(--success)', color: '#fff' }}
                      onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><UserCog size={18} /> Create New User</div>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="new-user-name">Full Name</label>
                  <input id="new-user-name" className={`form-input ${errors.full_name ? 'error' : ''}`} placeholder="John Doe" {...register('full_name')} />
                  {errors.full_name && <span className="form-error">{errors.full_name.message}</span>}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label required" htmlFor="new-user-username">Username</label>
                    <input id="new-user-username" className={`form-input ${errors.username ? 'error' : ''}`} placeholder="john_doe" {...register('username')} />
                    {errors.username && <span className="form-error">{errors.username.message}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label required" htmlFor="new-user-role">Role</label>
                    <select id="new-user-role" className="form-select" {...register('role')}>
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="new-user-password">Password</label>
                  <input id="new-user-password" type="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Min 8 characters" {...register('password')} />
                  {errors.password && <span className="form-error">{errors.password.message}</span>}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" id="save-user-btn" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
