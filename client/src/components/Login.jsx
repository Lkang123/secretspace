import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../store';
import { useThemeStore } from '../themeStore';
import { MessageCircle, Eye, EyeOff, Sun, Moon } from 'lucide-react';

export default function Login() {
  const login = useChatStore((state) => state.login);
  const { theme, toggleTheme } = useThemeStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
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

            <div>
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
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="mt-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                忘记密码？
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

      {/* 忘记密码提示弹窗 */}
      {showForgotPassword && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowForgotPassword(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-3">忘记密码</h3>
              <p className="text-[15px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                请联系管理员重置密码。管理员会在确认身份后帮你重置。
              </p>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="w-full h-11 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
