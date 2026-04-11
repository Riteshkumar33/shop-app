import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { HiOutlinePhone, HiOutlineShieldCheck, HiOutlineArrowRight } from 'react-icons/hi';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; // Loaded from .env

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [authMethod, setAuthMethod] = useState('google'); // 'google' | 'otp'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('customer');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setLoading(true);
      const { data } = await api.post('/auth/google', {
        credential: credentialResponse.credential,
        role,
      });
      login(data.token, data.user);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!phone) return toast.error('Enter your phone number');
    try {
      setLoading(true);
      await api.post('/auth/otp/send', { phone });
      setOtpSent(true);
      toast.success('OTP sent! Check your phone.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!code) return toast.error('Enter the OTP code');
    try {
      setLoading(true);
      const { data } = await api.post('/auth/otp/verify', { phone, code, name, role });
      login(data.token, data.user);
      toast.success('Welcome!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-page" className="min-h-screen flex items-center justify-center p-4 bg-bg-primary">
      {/* Decorative background */}
      <div className="fixed -top-[50%] -left-[30%] w-[80%] h-[150%] bg-[radial-gradient(ellipse,rgba(99,102,241,0.08)_0%,transparent_70%)] pointer-events-none" />
      <div className="fixed -bottom-[50%] -right-[30%] w-[80%] h-[150%] bg-[radial-gradient(ellipse,rgba(236,72,153,0.06)_0%,transparent_70%)] pointer-events-none" />

      <div className="glass-card glass-card--static auth-card">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-[0_8px_30px_rgba(99,102,241,0.3)]">🏪</div>
          <h1 className="heading-2">Welcome to <span className="text-gradient">ShopFlow</span></h1>
          <p className="text-secondary mt-2 text-sm">
            Sign in to manage your applications
          </p>
        </div>

        {/* Role selector */}
        <div className="flex gap-2 mb-6 bg-bg-glass rounded-lg p-1">
          {['customer', 'shopkeeper'].map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`flex-1 capitalize ${role === r ? 'btn btn--primary' : 'btn btn--ghost'}`}
              id={`role-${r}`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Auth method tabs */}
        <div className="flex gap-2 mb-6 border-b border-border-color pb-3">
          <button onClick={() => { setAuthMethod('google'); setOtpSent(false); }}
            className={`bg-transparent border-none font-semibold cursor-pointer text-sm pb-2 border-b-2 ${authMethod === 'google' ? 'text-primary-400 border-primary-400' : 'text-text-muted border-transparent'}`}>
            Google
          </button>
          <button onClick={() => setAuthMethod('otp')}
            className={`bg-transparent border-none font-semibold cursor-pointer text-sm pb-2 border-b-2 ${authMethod === 'otp' ? 'text-primary-400 border-primary-400' : 'text-text-muted border-transparent'}`}>
            Phone OTP
          </button>
        </div>

        {/* Google Sign-In */}
        {authMethod === 'google' && (
          <div className="flex justify-center">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google sign-in failed')}
                theme="filled_black"
                size="large"
                width="360"
                shape="pill"
              />
            </GoogleOAuthProvider>
          </div>
        )}

        {/* OTP Flow */}
        {authMethod === 'otp' && (
          <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP}>
            {!otpSent && (
              <>
                <div className="form-group mb-4">
                  <label className="form-label">Your Name</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    id="otp-name"
                  />
                </div>
                <div className="form-group mb-6">
                  <label className="form-label">Phone Number</label>
                  <div className="relative">
                    <HiOutlinePhone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      className="form-input pl-10"
                      type="tel"
                      placeholder="+91 9876543210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      required
                      id="otp-phone"
                    />
                  </div>
                </div>
              </>
            )}

            {otpSent && (
              <div className="form-group mb-6">
                <label className="form-label">
                  <HiOutlineShieldCheck className="inline mr-1" />
                  Enter OTP
                </label>
                <input
                  className="form-input text-center text-2xl tracking-[0.3em]"
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  maxLength={6}
                  autoFocus
                  required
                  id="otp-code"
                />
                <p className="text-text-muted text-xs mt-2">
                  OTP sent to {phone}.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn--primary btn--lg w-full"
              disabled={loading}
              id="otp-submit"
            >
              {loading ? (
                <span className="spinner" style={{ width: 20, height: 20 }} />
              ) : otpSent ? (
                <>Verify OTP <HiOutlineArrowRight /></>
              ) : (
                <>Send OTP <HiOutlineArrowRight /></>
              )}
            </button>

            {otpSent && (
              <button
                type="button"
                className="btn btn--ghost w-full mt-3"
                onClick={() => { setOtpSent(false); setCode(''); }}
              >
                Change number
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
