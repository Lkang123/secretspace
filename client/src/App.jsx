import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from './store';
import { useThemeStore } from './themeStore';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { AlertTriangle, CheckCircle, X, Shield, Trash2, Users, Edit2, Key, LogIn } from 'lucide-react';

function App() {
  const { 
    user, 
    initSocket, 
    connected, 
    showWelcomeModal, 
    closeWelcomeModal, 
    showAdminWelcomeModal,
    closeAdminWelcomeModal,
    showAdminPanel,
    closeAdminPanel,
    adminRooms,
    fetchAdminRooms,
    joinRoom,
    dismissRoom,
    roomDismissedInfo,
    closeRoomDismissedModal,
    fetchAdminUsers,
    adminUpdateUser,
    fetchRoomUsers
  } = useChatStore();
  const { theme } = useThemeStore();
  
  // Admin dismiss confirmation state
  const [dismissConfirm, setDismissConfirm] = useState({ open: false, room: null });

  // Admin Panel States
  const [adminTab, setAdminTab] = useState('rooms'); // 'rooms' or 'users'
  const [adminUsers, setAdminUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null); // User being edited
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [viewingRoomUsers, setViewingRoomUsers] = useState(null); // Room ID whose users we are viewing
  const [roomUsersList, setRoomUsersList] = useState([]);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  // Apply theme class to html element
  useEffect(() => {
    // If theme is dark, add 'dark' class. If light, remove it.
    // Default to dark if preference is not set (optional, but we start with dark)
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleUpdateUser = async () => {
    if (!editingUser || !editUsername || !editPassword) return;
    
    try {
      const result = await adminUpdateUser(editingUser.username, editUsername, editPassword);
      if (result.success) {
          setEditingUser(null);
          const users = await fetchAdminUsers();
          setAdminUsers(users || []);
      } else {
          alert(result.error || 'Update failed');
      }
    } catch (err) {
      console.error('Update user error:', err);
      alert('Update failed');
    }
  };

  const handleViewRoomUsers = async (roomId) => {
      try {
        const users = await fetchRoomUsers(roomId);
        setRoomUsersList(Array.isArray(users) ? users : []);
        setViewingRoomUsers(roomId);
      } catch (err) {
        console.error('Fetch room users error:', err);
        setRoomUsersList([]);
      }
  };

  // Show loading state while connecting or restoring session
  if (!connected) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connecting...
          </p>
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

      {/* Admin Welcome Modal */}
      <AnimatePresence>
        {showAdminWelcomeModal && (
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
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">管理员模式已开启</h3>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      您拥有解散房间等高级权限，请谨慎操作。
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeAdminWelcomeModal}
                  className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  管理员当前能力：
                  <br />
                  1. 可以删除任意房间；
                  <br />
                  2. 后续会逐步增加用户管理、公告等功能。
                </p>
              </div>

              <button
                onClick={closeAdminWelcomeModal}
                className="w-full h-12 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                我知道了，进入管理
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal - centered on full page */}
      <AnimatePresence>
        {showAdminPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeAdminPanel}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[600px] max-h-[80vh] shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                    <Shield size={18} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Admin Panel</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">系统管理后台</span>
                  </div>
                </div>
                <button
                  onClick={closeAdminPanel}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-4 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
                <button
                  onClick={() => setAdminTab('rooms')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    adminTab === 'rooms' 
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  房间管理
                </button>
                <button
                  onClick={() => setAdminTab('users')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    adminTab === 'users' 
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  用户管理
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-[300px]">
                {adminTab === 'rooms' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[11px] text-zinc-500">共 {adminRooms.length} 个房间</span>
                        <button onClick={fetchAdminRooms} className="text-[11px] text-indigo-500 hover:underline">刷新列表</button>
                    </div>
                    {adminRooms.length === 0 ? (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 py-8 text-center">当前没有房间。</div>
                    ) : (
                      adminRooms.map((room) => (
                        <div key={room.id} className="flex items-center justify-between px-3 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50">
                          <div className="flex flex-col max-w-[40%]">
                            <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{room.name}</span>
                            <span className="text-[10px] text-zinc-400 truncate font-mono">{room.id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewRoomUsers(room.id)}
                              className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                            >
                              <Users size={12} />
                              <span>{room.userCount} 人</span>
                            </button>
                            <button
                              onClick={async () => { await joinRoom(room.id); closeAdminPanel(); }}
                              className="h-7 px-3 rounded-full text-[11px] font-medium bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-zinc-200 transition-colors"
                            >
                              进入
                            </button>
                            <button
                              onClick={() => setDismissConfirm({ open: true, room })}
                              className="h-7 px-3 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                            >
                              解散
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[11px] text-zinc-500">共 {adminUsers.length} 位用户</span>
                        <button onClick={() => fetchAdminUsers().then(setAdminUsers)} className="text-[11px] text-indigo-500 hover:underline">刷新列表</button>
                    </div>
                    {adminUsers.map((u) => (
                        <div key={u.username} className="flex items-center justify-between px-3 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-900 dark:text-white">{u.username}</span>
                                    {u.isAdmin && <Shield size={12} className="text-amber-500" />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                    <span className="text-[10px] text-zinc-400">
                                        {u.isOnline ? (u.currentRoomName ? `在房间: ${u.currentRoomName}` : '在线 (空闲)') : '离线'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="hidden sm:flex flex-col items-end mr-2">
                                    <span className="text-[10px] text-zinc-400 font-mono">Pwd: {u.password}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingUser(u);
                                        setEditUsername(u.username);
                                        setEditPassword(u.password);
                                    }}
                                    className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 transition-colors"
                                >
                                    <Edit2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                onClick={() => setEditingUser(null)}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">编辑用户</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-zinc-500 mb-1 block">用户名</label>
                            <input 
                                type="text" 
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:border-indigo-500 outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 mb-1 block">密码</label>
                            <input 
                                type="text" 
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:border-indigo-500 outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                        <button onClick={() => setEditingUser(null)} className="flex-1 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">取消</button>
                        <button onClick={handleUpdateUser} className="flex-1 h-9 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600">保存</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Room Users Modal */}
      <AnimatePresence>
        {viewingRoomUsers && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                onClick={() => setViewingRoomUsers(null)}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[320px] max-h-[60vh] flex flex-col shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">房间成员</h3>
                        <button onClick={() => setViewingRoomUsers(null)} className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={16}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {roomUsersList.length === 0 ? (
                            <p className="text-center text-xs text-zinc-500 py-4">房间空空如也</p>
                        ) : (
                            roomUsersList.map((u, i) => (
                                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                        {u.username.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1">
                                            <span className="text-sm font-medium text-zinc-900 dark:text-white">{u.username}</span>
                                            {u.isAdmin && <Shield size={10} className="text-amber-500" />}
                                        </div>
                                        <span className="text-[10px] text-zinc-400">
                                            {u.realUsername !== u.username ? `(Real: ${u.realUsername})` : ''} 
                                            {u.isStealth ? ' [隐身]' : ''}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Dismiss Confirmation Modal */}
      <AnimatePresence>
        {dismissConfirm.open && dismissConfirm.room && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDismissConfirm({ open: false, room: null })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[380px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                  <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">确认解散房间？</h3>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    此操作不可撤销
                  </p>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
                  即将解散房间：<span className="font-bold">{dismissConfirm.room.name}</span>
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
                  房间内的所有用户将被移出，所有消息将被清除。
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDismissConfirm({ open: false, room: null })}
                  className="flex-1 h-11 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    dismissRoom(dismissConfirm.room.id, () => {
                      fetchAdminRooms();
                    });
                    setDismissConfirm({ open: false, room: null });
                  }}
                  className="flex-1 h-11 rounded-full bg-red-500 text-white font-bold hover:bg-red-600 transition-colors"
                >
                  确认解散
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room Dismissed Notification Modal */}
      <AnimatePresence>
        {roomDismissedInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeRoomDismissedModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[380px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">房间已解散</h3>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {roomDismissedInfo.message}
                </p>
              </div>

              <button
                onClick={closeRoomDismissedModal}
                className="w-full h-11 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                我知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
