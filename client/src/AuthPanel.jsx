import { useEffect, useRef, useState } from 'react'
import { createApi } from './api'
import { registrationPayload, validateRegistration } from './registration'

const api = createApi({ baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000' })
const initial = { name: '', email: '', password: '', confirmPassword: '', businessName: '', industry: '', publicHandle: '' }
function AuthField({ name, label, error, ...props }) {
  return <label className="field"><span>{label}</span><input name={name} aria-invalid={!!error} aria-describedby={error ? `auth-${name}-error` : undefined} {...props} />{error && <span className="field-error" id={`auth-${name}-error`}>{error}</span>}</label>
}
export default function AuthPanel({ onLogin }) {
  const [screen, setScreen] = useState('login'), [role, setRole] = useState('business'), [fields, setFields] = useState(initial)
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef(null), submitting = useRef(false), heading = useRef(null), focused = useRef(false)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => { if (focused.current) heading.current?.focus(); focused.current = true }, [screen])
  function navigate(next) { if (submitting.current) return; setScreen(next); setError(''); setErrors({}); setFields(old => ({ ...old, password: '', confirmPassword: '' })) }
  function change(key, value) { setFields(old => ({ ...old, [key]: value })); setErrors(old => ({ ...old, [key]: undefined })); setError('') }
  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const registering = screen === 'register'
    if (registering) {
      const invalid = validateRegistration(role, fields); setErrors(invalid)
      if (Object.keys(invalid).length) { setError('Check the highlighted fields.'); return }
    }
    submitting.current = true; setBusy(true); setError('')
    const controller = new AbortController(); pending.current = controller
    try {
      if (registering) {
        await api(`/auth/register/${role}`, { body: registrationPayload(role, fields), signal: controller.signal })
        if (controller.signal.aborted) return
        setFields({ ...initial, email: fields.email.trim().toLowerCase() }); setErrors({}); setScreen('login')
        setSuccess(`Your ${role} account has been created. Sign in below${role === 'business' ? ' to create your first campaign' : '. Use the Bizi assistant to complete your creator profile'}.`)
      } else {
        const session = await api('/auth/login', { body: { email: fields.email.trim().toLowerCase(), password: fields.password }, signal: controller.signal })
        if (!controller.signal.aborted) onLogin(session)
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(/email already exists/i.test(e.message) ? 'An account with this email already exists. Sign in or use another email address.' : e.message || 'Please try again.')
    } finally { submitting.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  const registering = screen === 'register', choosing = screen === 'choose'
  const field = (name, label, extras = {}) => <AuthField key={name} name={name} label={label} value={fields[name]} onChange={e => change(name, e.target.value)} disabled={busy} error={errors[name]} maxLength={255} {...extras} />
  return <main className="login-layout"><section className="intro"><p className="eyebrow">CREATOR PARTNERSHIPS, WITH EVIDENCE</p><h1>Find the right fit.<br /><em>Know what’s behind it.</em></h1><p>Join as a business to discover creators, or as a creator to build your presence on Bizi.</p><div className="intro-note">Clear scores. Visible uncertainty. Your campaign goals.</div></section><section className="panel login-panel"><p className="eyebrow">{screen === 'login' ? 'WELCOME TO BIZI' : 'JOIN BIZI'}</p><h2 ref={heading} tabIndex={-1}>{choosing ? 'How will you use Bizi?' : registering ? `Create your ${role} account` : 'Sign in to your workspace'}</h2>
    {choosing ? <><p className="muted">Choose the account that fits what you want to do.</p><fieldset className="role-choices"><legend className="sr-only">Account type</legend>{['business', 'creator'].map(value => <label className={`role-choice ${role === value ? 'checked' : ''}`} key={value}><input type="radio" name="accountType" value={value} checked={role === value} onChange={() => setRole(value)} /><span><strong>{value === 'business' ? 'I’m a business' : 'I’m a creator'}</strong><span>{value === 'business' ? 'Create campaigns and discover suitable creators.' : 'Build your profile and keep your creator details up to date.'}</span></span></label>)}</fieldset><button className="primary auth-wide" onClick={() => navigate('register')}>Continue as {role}</button><p className="auth-switch">Already have an account? <button className="text-button" onClick={() => navigate('login')}>Sign in</button></p></> : <>
      <p className="muted">{registering ? (role === 'business' ? 'Tell us about you and your business.' : 'Tell us who you are and how audiences know you.') : 'Sign in with your business or creator account.'}</p>
      {screen === 'login' && success && <p className="notice" role="status">{success}</p>}
      <form onSubmit={submit}>
        {registering && field('name', 'Your name', { required: true, autoComplete: 'name' })}
        {field('email', 'Email address', { type: 'email', required: true, autoComplete: 'username' })}
        {registering && (role === 'business' ? <>{field('businessName', 'Business name', { required: true, autoComplete: 'organization' })}{field('industry', 'Industry (optional)', { placeholder: 'Fashion, food, technology…' })}</> : field('publicHandle', 'Public creator handle', { required: true, placeholder: '@yourhandle', autoComplete: 'off' }))}
        {field('password', 'Password', { type: 'password', required: true, autoComplete: registering ? 'new-password' : 'current-password', minLength: registering ? 6 : undefined, maxLength: registering ? 72 : undefined })}
        {registering && <><p className="muted small">Use at least 6 characters. Your password is never shown publicly.</p>{field('confirmPassword', 'Confirm password', { type: 'password', required: true, autoComplete: 'new-password', maxLength: 72 })}</>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="primary auth-wide" disabled={busy}>{busy ? (registering ? 'Creating your account…' : 'Signing in…') : registering ? `Create ${role} account` : 'Sign in'}</button>
      </form>
      {registering ? <p className="auth-switch"><button className="text-button" disabled={busy} onClick={() => navigate('choose')}>Change account type</button><span aria-hidden="true"> · </span><button className="text-button" disabled={busy} onClick={() => navigate('login')}>Back to sign in</button></p> : <p className="auth-switch">New to Bizi? <button className="text-button" disabled={busy} onClick={() => { setSuccess(''); navigate('choose') }}>Create an account</button></p>}
    </>}
  </section></main>
}
