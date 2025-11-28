import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from './store';
import { useThemeStore } from './themeStore';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

function App() {
  const { user, initSocket, connected, showWelcomeModal, closeWelcomeModal } = useChatStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  // Apply theme class to html element
  useEffect(() => {
    // If theme is dark, add 'dark' class. If light, remove it.
    // Default to dark if preference is not set (optional, but we start with dark)
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <div className="h-screen flex bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
        <Sidebar />
        <ChatArea />
      </div>

      {/* Welcome Modal for New Users */}
      <AnimatePresence>
        {showWelcomeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-[380px] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                    <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">注册成功！</h3>
                </div>
                <button
                  onClick={closeWelcomeModal}
                  className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mb-4">
                <div className="flex gap-3">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[14px] font-medium text-amber-800 dark:text-amber-300 mb-2">
                      请务必记住您的密码！
                    </p>
                    <p className="text-[13px] text-amber-700 dark:text-amber-400/80">
                      系统不支持密码找回，如果忘记密码，您需要重新注册新账号，所有创建的房间和聊天数据将无法恢复。
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={closeWelcomeModal}
                className="w-full h-12 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                我已记住，开始使用
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
