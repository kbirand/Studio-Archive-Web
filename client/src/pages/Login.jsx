import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../api/axios'; // We will create this next

import { useNavigate } from 'react-router-dom';

const Login = ({ onLoginSuccess }) => {
    const navigate = useNavigate();
    const [status, setStatus] = React.useState({ type: '', message: '' });

    const handleSuccess = async (credentialResponse) => {
        setStatus({ type: '', message: '' });
        try {
            const { credential } = credentialResponse;
            const res = await api.post('/auth/google', { credential });

            const { token, user } = res.data;
            localStorage.setItem('session_token', token);
            localStorage.setItem('user_data', JSON.stringify(user));

            if (onLoginSuccess) {
                onLoginSuccess(user);
            } else {
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Login failed', error);
            if (error.response && error.response.status === 403) {
                setStatus({
                    type: 'warning',
                    message: 'Your account is pending approval. Please wait for an administrator to verify your access.'
                });
            } else {
                setStatus({
                    type: 'error',
                    message: 'Login failed. Please try again.'
                });
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-black text-white">
            <div className="bg-[#121212] p-8 rounded-xl border border-[#333] shadow-2xl w-full max-w-md text-center">
                <h1 className="text-2xl font-bold mb-2 tracking-wide text-gray-100">Koray Birand Archive</h1>
                <p className="mb-8 text-sm text-gray-500 uppercase tracking-widest">Client Access</p>

                {status.message && (
                    <div className={`mb-6 p-4 rounded text-sm text-left border ${status.type === 'warning'
                        ? 'bg-yellow-900/20 border-yellow-700 text-yellow-500'
                        : 'bg-red-900/20 border-red-700 text-red-500'
                        }`}>
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {status.type === 'warning'
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                }
                            </svg>
                            <span>{status.message}</span>
                        </div>
                    </div>
                )}

                <div className="flex justify-center bg-[#1a1a1a] p-2 rounded-lg border border-[#333]">
                    <GoogleLogin
                        onSuccess={handleSuccess}
                        onError={() => {
                            setStatus({ type: 'error', message: 'Google Login Failed' });
                        }}
                        theme="filled_black"
                        shape="rectangular"
                        width="300"
                    />
                </div>
            </div>
        </div>
    );
};

export default Login;
