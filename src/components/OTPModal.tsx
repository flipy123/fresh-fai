import React, { useState, useEffect } from 'react';
import { X, Clock, RefreshCw, Shield } from 'lucide-react';
import { useApi } from '../contexts/ApiContext';

interface OTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OTPModal: React.FC<OTPModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [otp, setOtp] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes
  const [otpStatus, setOtpStatus] = useState<any>(null);
  const { api } = useApi();

  useEffect(() => {
    if (isOpen) {
      fetchOTPStatus();
      const interval = setInterval(fetchOTPStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchOTPStatus = async () => {
    try {
      const response = await api.get('/kotak/otp-status');
      if (response.data.success) {
        setOtpStatus(response.data.data);
        setTimeRemaining(Math.floor(response.data.data.timeRemaining / 1000));
      }
    } catch (error) {
      console.error('Failed to fetch OTP status:', error);
    }
  };

  const handleValidateOTP = async () => {
    if (!otp || otp.length !== 4) {
      setError('Please enter a valid 4-digit OTP');
      return;
    }

    setIsValidating(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/kotak/validate-otp', { otp });
      if (response.data.success) {
        setSuccess('OTP validated successfully! Trading is now enabled.');
        setTimeout(() => {
          onSuccess();
          setOtp('');
          setSuccess('');
        }, 2000);
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'OTP validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRegenerateOTP = async () => {
    setIsRegenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/kotak/regenerate-otp');
      if (response.data.success) {
        setOtp('');
        setSuccess('New OTP sent successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to regenerate OTP');
    } finally {
      setIsRegenerating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOTPInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setOtp(value);
    setError('');
    setSuccess('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && otp.length === 4 && !isValidating && !isExpired) {
      handleValidateOTP();
    }
  };

  if (!isOpen) return null;

  const isExpired = otpStatus?.otpExpired || timeRemaining <= 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-blue-400" />
            <h3 className="text-xl font-semibold text-white">Verify OTP</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-300 text-sm mb-3">
            A 4-digit OTP has been sent to your registered mobile number and email address.
          </p>
          
          {otpStatus && (
            <div className="flex items-center space-x-2 text-sm p-3 bg-gray-700 rounded-lg">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className={`font-medium ${isExpired ? 'text-red-400' : 'text-blue-400'}`}>
                {isExpired ? 'OTP Expired' : `Time remaining: ${formatTime(timeRemaining)}`}
              </span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Enter 4-digit OTP
          </label>
          <input
            type="text"
            value={otp}
            onChange={handleOTPInput}
            onKeyPress={handleKeyPress}
            placeholder="0000"
            className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:border-blue-400 focus:outline-none text-center text-2xl tracking-[0.5em] font-mono"
            maxLength={4}
            disabled={isValidating || isExpired}
            autoFocus
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-600/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-600/20 border border-green-600/30 rounded-lg text-green-400 text-sm">
            <strong>Success:</strong> {success}
          </div>
        )}

        <div className="flex space-x-3 mb-6">
          {isExpired ? (
            <button
              onClick={handleRegenerateOTP}
              disabled={isRegenerating}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium"
            >
              {isRegenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Regenerating...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Regenerate OTP</span>
                </>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={handleRegenerateOTP}
                disabled={isRegenerating || isValidating}
                className="px-4 py-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded-lg transition-colors"
              >
                {isRegenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button
                onClick={handleValidateOTP}
                disabled={isValidating || !otp || otp.length !== 4}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors font-medium"
              >
                {isValidating ? 'Validating...' : 'Validate OTP'}
              </button>
            </>
          )}
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p>• OTP is valid for 5 minutes</p>
          <p>• You can regenerate OTP if it expires</p>
          <p>• Trading will be enabled after successful validation</p>
          <p>• Press Enter to validate when OTP is complete</p>
        </div>
      </div>
    </div>
  );
};