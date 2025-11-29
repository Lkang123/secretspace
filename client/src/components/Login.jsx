import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../store';
import { MessageCircle, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const login = useChatStore((state) => state.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const validateUsername = (value) => {
    if (!value) {
      setUsernameError('');
      return;
    }
    
    if (value.length < 2) {
      setUsernameError('用户名至少需要2个字符');
      return;
    }
    
    if (value.length > 16) {
      setUsernameError('用户名不能超过16个字符');
      return;
    }
    
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(value)) {
      setUsernameError('用户名只能包含字母、数字、下划线');
      return;
    }
    
    setUsernameError('');
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    if (usernameError) return; // Don't submit if username has errors
    
    setError('');
    
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || '登录失败');
    }
    // Modal is now handled by App.jsx
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px] relative z-10"
      >
        <div className="w-full">
            {/* Header */}
            <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-900 dark:bg-white mb-8">
                <MessageCircle size={32} className="text-white dark:text-black" />
            </div>
            <h1 className="text-[31px] font-bold text-zinc-900 dark:text-white tracking-tight">Sign in to SecretSpace</h1>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
                <div className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-500/10 p-2 rounded-md border border-red-100 dark:border-red-500/20">
                    {error}
                </div>
            )}
            <div className="h-[72px]">
                <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="Username"
                    autoFocus
                    className={`w-full h-14 px-4 text-[17px] rounded-md bg-transparent border ${
                      usernameError 
                        ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500' 
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-white focus:ring-zinc-900 dark:focus:ring-white'
                    } text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-all`}
                />
                <div className="h-6">
                  {usernameError && (
                    <p className="text-red-500 text-sm mt-1 font-medium">{usernameError}</p>
                  )}
                </div>
            </div>

            <div className="relative">
                <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full h-14 px-4 pr-12 text-[17px] rounded-md bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white transition-all"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>

            <motion.button
                type="submit"
                disabled={!username.trim() || !password.trim() || !!usernameError}
                whileTap={{ scale: 0.98 }}
                className="w-full h-14 flex items-center justify-center rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[17px] font-bold hover:bg-black dark:hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Sign In / Sign Up
            </motion.button>
            </form>

            <p className="text-center text-[15px] text-zinc-500 mt-10">
              新用户将自动注册，请牢记密码
            </p>
        </div>
      </motion.div>
    </div>
  );
}
