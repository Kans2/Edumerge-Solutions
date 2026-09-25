import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { GraduationCap, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLoginMutation } from '../api/endpoints';
import { setCredentials } from '../app/authSlice';
import { FieldError } from '../components/Common';

const DEMO = [
  { label: 'Faculty', email: 'faculty@college.edu' },
  { label: 'HOD', email: 'hod.cse@college.edu' },
  { label: 'Attendance officer', email: 'officer@college.edu' },
  { label: 'Admin', email: 'admin@college.edu' },
];

export default function Login() {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm();
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = async (values) => {
    try {
      const data = await login(values).unwrap();
      dispatch(setCredentials(data));
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}`);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Sign-in failed');
    }
  };

  const serverMessage = error?.data?.error?.message;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:flex flex-col justify-center bg-slate-50 border-r border-slate-200 p-12">
        <GraduationCap size={44} className="text-brand-600" aria-hidden="true" />
        <h1 className="mt-6 text-3xl font-semibold leading-tight text-slate-900">
          Smart Attendance Management
        </h1>
        <p className="mt-4 text-slate-600 max-w-md">
          Mark a class in seconds, correct mistakes through a reviewed workflow,
          and see exactly which students are falling behind.
        </p>
        <ul className="mt-8 space-y-2 text-sm text-slate-600">
          <li>Everyone defaults to present — mark only the absentees</li>
          <li>Approved on-duty and medical leave never count against a student</li>
          <li>Excel exports with your own column names</li>
        </ul>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Use your college email address.</p>

          {serverMessage && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3" role="alert" aria-live="assertive">
              <p className="text-sm text-red-700">{serverMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email', { required: 'Email is required' })}
              />
              <FieldError error={errors.email} id="email-error" />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password', { required: 'Password is required' })}
              />
              <FieldError error={errors.password} id="password-error" />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={isLoading}>
              <LogIn size={16} aria-hidden="true" />
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Demo accounts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => { setValue('email', d.email); setValue('password', 'Password@123'); }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              All demo accounts use Password@123. Student emails follow the roll number, e.g. 24cse001@student.college.edu
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
