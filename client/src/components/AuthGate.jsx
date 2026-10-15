import { useEffect, useState } from 'react';
import { LogIn, Mail, NotebookPen, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import App from '../App.jsx';
import EmptyIllustration from './EmptyIllustration.jsx';

const MIN_PASSWORD_LENGTH = 8; // matches the server

// Shows the sign-in screen until /api/auth/me returns a user, then the app.
export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined while checking, null when signed out
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));
  const [providers, setProviders] = useState(null); // { google } once known
  const [mode, setMode] = useState(null); // null (choose), 'signin' or 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      if (theme) document.documentElement.dataset.theme = theme;
    } catch {
      /* storage unavailable */
    }
    if (error) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    api.me().then(setUser, () => setUser(null));
    api.providers().then(setProviders, () => setProviders({ google: false }));
    // Only on mount: `error` is cleared from the URL above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (key) => ({ value: form[key], onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })) });
  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setForm((f) => ({ ...f, password: '', confirm: '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && form.password !== form.confirm) return setError("Passwords don't match");
    setBusy(true);
    try {
      if (mode === 'signup') await api.signup(form.name, form.email, form.password);
      else await api.localLogin(form.email, form.password);
      setUser(await api.me());
    } catch (err) {
      setError(err.message);
      setForm((f) => ({ ...f, password: '', confirm: '' }));
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined || !providers) return null;
  if (user) return <App user={user} onLogout={() => api.logout().finally(() => setUser(null))} />;
  // Without Google there's nothing to choose between, so show the email form straight away.
  const current = mode ?? (providers.google ? null : 'signin');
  const signingUp = current === 'signup';

  return (
    <div className="login">
      <div className="empty-state login-card">
        <EmptyIllustration />
        <h1>
          <NotebookPen size={22} /> Notes<span className="brand-dot">.</span>
        </h1>
        <p>{signingUp ? 'Create an account to start taking notes.' : 'Sign in to read and edit your notes.'}</p>
        {error && <p className="login-error">{error}</p>}
        {providers.google && (
          <a className="btn outline login-btn google-btn" href={api.loginUrl}>
            <GoogleLogo /> {signingUp ? 'Sign up with Google' : 'Sign in with Google'}
          </a>
        )}
        {current ? (
          <form className="login-form" onSubmit={submit} key={current}>
            {signingUp && <input type="text" autoComplete="name" placeholder="Name (optional)" maxLength={100} {...field('name')} />}
            <input type="email" autoComplete="email" placeholder="Email" required autoFocus {...field('email')} />
            <input
              type="password"
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              placeholder={signingUp ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : 'Password'}
              required
              minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
              {...field('password')}
            />
            {signingUp && (
              <input type="password" autoComplete="new-password" placeholder="Repeat password" required {...field('confirm')} />
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {signingUp ? <UserPlus size={16} /> : <LogIn size={16} />} {signingUp ? 'Create account' : 'Sign in'}
            </button>
          </form>
        ) : (
          <button className="btn outline login-btn" onClick={() => switchMode('signin')}>
            <Mail size={17} /> Sign in with email
          </button>
        )}
        <p className="login-switch">
          {signingUp ? 'Already have an account?' : 'New here?'}{' '}
          <button className="link-btn" onClick={() => switchMode(signingUp ? 'signin' : 'signup')}>
            {signingUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  );
}

// Google's multicolour "G" mark.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
