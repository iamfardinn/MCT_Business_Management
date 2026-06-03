import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, User, Eye, EyeOff, Loader } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [showPass, setShowPass] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: LoginForm) {
    try {
      const { data } = await api.post('/auth/login', values);
      login(data.data.user, data.data.access_token, data.data.refresh_token);
      toast.success(`Welcome back, ${data.data.user.full_name}!`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      toast.error(msg);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">M</div>
          <h1 className="login-title">MCT Business System</h1>
          <p className="login-subtitle">Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required" htmlFor="login-username">Username</label>
              <div style={{ position: 'relative' }}>
                <User
                  size={15}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="login-username"
                  className={`form-input ${errors.username ? 'error' : ''}`}
                  style={{ paddingLeft: 36 }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  {...register('username')}
                />
              </div>
              {errors.username && <span className="form-error">{errors.username.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label required" htmlFor="login-password">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={15}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  aria-label="Toggle password visibility"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <span className="form-error">{errors.password.message}</span>}
            </div>

            <button
              type="submit"
              id="login-submit-btn"
              className="btn btn-primary btn-lg w-full"
              disabled={isSubmitting}
              style={{ justifyContent: 'center', marginTop: 'var(--space-2)' }}
            >
              {isSubmitting ? <Loader size={16} className="spinner" style={{ animation: 'spin 0.6s linear infinite' }} /> : null}
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          MCT Business Management System v1.0
        </p>
      </div>
    </div>
  );
}
