import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from './store';
import { useThemeStore } from './themeStore';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import DMChatArea from './components/DMChatArea';
import DialogContainer, { showConfirm, showAlert } from './components/Dialog';
import { AlertTriangle, CheckCircle, X, Shield, Trash2, Users, Edit2, Key, LogIn, UserX, Crown } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

function App() {
  const { 
    user, 
    initSocket, 
    connected, 
    currentRoom,
    isRestoring,
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
    fetchRoomUsers,
    adminDeleteUser,
    adminKickUser,
    forceLogoutMessage,
    kickedFromRoom,
    closeKickedModal,
    kickCooldownInfo,
    closeKickCooldownModal,
    // DM 相关
    showDMPanel,
    currentDM
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
  const [deleteUserConfirm, setDeleteUserConfirm] = useState({ step: 0, user: null }); // 0: closed, 1-2: confirmation steps
  const [kickUserConfirm, setKickUserConfirm] = useState({ open: false, roomId: null, username: null }); // Kick user confirmation

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  // Debug: Monitor forceLogoutMessage changes
  useEffect(() => {
    console.log('forceLogoutMessage changed:', forceLogoutMessage);
  }, [forceLogoutMessage]);

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
          showAlert(result.error || '更新失败', { variant: 'danger' });
      }
    } catch (err) {
      console.error('Update user error:', err);
      showAlert('更新失败', { variant: 'danger' });
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

  const handleDeleteUser = async () => {
    if (!deleteUserConfirm.user) return;
    
    const username = deleteUserConfirm.user.username;
    console.log('Deleting user:', username);
    
    try {
      const result = await adminDeleteUser(username);
      console.log('Delete result:', result);
      
      if (result.success) {
        toast.success(`用户 ${username} 已被删除`, {
          duration: 3000,
        });
        setDeleteUserConfirm({ step: 0, user: null });
        
        // Refresh user list
        console.log('Refreshing user list...');
        const users = await fetchAdminUsers();
        console.log('Updated user list:', users);
        setAdminUsers(users || []);
      } else {
        console.error('Delete failed:', result.error);
        toast.error(result.error || '删除失败', {
          duration: 3000,
        });
      }
    } catch (err) {
      console.error('Delete user error:', err);
      toast.error('删除失败：网络错误', {
        duration: 3000,
      });
    }
  };

  const handleForceLogoutConfirm = () => {
    // Clear all localStorage
    localStorage.removeItem('chat_session');
    localStorage.removeItem('last_room_id');
    // Reload page to show login screen
    window.location.reload();
  };

  const handleKickUserConfirm = async () => {
    const { roomId, username } = kickUserConfirm;
    if (!roomId || !username) return;
    
    try {
      const result = await adminKickUser(roomId, username);
      if (result.success) {
        toast.success(`已将 ${username} 踢出房间`);
        setKickUserConfirm({ open: false, roomId: null, username: null });
        
        // Refresh room users list
        const users = await fetchRoomUsers(roomId);
        
        // If room is now empty (dismissed), close the modal and refresh room list
        if (!users || users.length === 0) {
          setViewingRoomUsers(null);
          setRoomUsersList([]);
          // Refresh admin room list (updates adminRooms in store)
          fetchAdminRooms();
        } else {
          // Room still has users, update the list
          setRoomUsersList(users);
        }
      } else {
        toast.error(result.error || '踢人失败');
      }
    } catch (err) {
      console.error('Kick user error:', err);
      toast.error('踢人失败：网络错误');
    }
  };

  // Render Force Logout Modal at the top level (before user check)
  console.log('Rendering forceLogoutModal, message:', forceLogoutMessage);
  const forceLogoutModal = (
    <AnimatePresence>
      {forceLogoutMessage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-[420px] shadow-2xl border-2 border-red-500"
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                账号已被删除
              </h3>
              <p className="text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {forceLogoutMessage.reason}
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-800 dark:text-red-300 text-center">
                您的账号信息已被清除，将返回登录页面。
              </p>
            </div>

            <button
              onClick={handleForceLogoutConfirm}
              className="w-full h-12 rounded-full bg-red-600 text-white font-bold hover:bg-red-700 transition-colors text-base"
            >
              确认
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Show loading state while connecting or restoring session
  if (!connected || isRestoring) {
    return (
      <>
        {forceLogoutModal}
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center transition-colors duration-300">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {!connected ? 'Connecting...' : 'Restoring session...'}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {forceLogoutModal}
        <Login />
      </>
    );
  }

  return (
    <>
      {forceLogoutModal}
      <Toaster 
        position="top-center"
        containerStyle={{
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      <div className="h-dvh flex bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300 overflow-hidden">
        <div className={`${(currentRoom || showDMPanel) ? 'hidden md:block' : 'block'} w-full md:w-auto h-full z-20`}>
           <Sidebar />
        </div>
        <div className={`${!(currentRoom || showDMPanel) ? 'hidden md:flex' : 'flex'} flex-1 h-full w-full relative z-10`}>
           {showDMPanel ? <DMChatArea /> : <ChatArea />}
        </div>
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
                  1. 管理并解散任意房间；
                  <br />
                  2. 查看房间成员，并可踢出违规用户（含冷却时间限制）；
                  <br />
                  3. 管理用户账号（查看、编辑用户名 / 密码、删除用户）；
                  <br />
                  4. 发布房间通知与顶部公告。
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
                                    title="编辑用户"
                                >
                                    <Edit2 size={14} />
                                </button>
                                {!u.isAdmin && (
                                    <button
                                        onClick={() => setDeleteUserConfirm({ step: 1, user: u })}
                                        className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 transition-colors"
                                        title="删除用户"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
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
                                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                            {u.username.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm font-medium text-zinc-900 dark:text-white">{u.username}</span>
                                                {u.isOwner && <Crown size={12} className="text-yellow-500" title="房主" />}
                                                {u.isAdmin && <Shield size={10} className="text-amber-500" title="管理员" />}
                                            </div>
                                            <span className="text-[10px] text-zinc-400">
                                                {u.realUsername !== u.username ? `(Real: ${u.realUsername})` : ''} 
                                                {u.isStealth ? ' [隐身]' : ''}
                                            </span>
                                        </div>
                                    </div>
                                    {!u.isAdmin && (
                                        <button
                                            onClick={() => setKickUserConfirm({ open: true, roomId: viewingRoomUsers, username: u.realUsername })}
                                            className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 transition-colors"
                                            title="踢出房间"
                                        >
                                            <UserX size={14} />
                                        </button>
                                    )}
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

      {/* Delete User - Three Step Confirmation Modal */}
      <AnimatePresence>
        {deleteUserConfirm.step > 0 && deleteUserConfirm.user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteUserConfirm({ step: 0, user: null })}
          >
            <motion.div
              key={deleteUserConfirm.step}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[400px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {deleteUserConfirm.step === 1 && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                      <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">确认删除用户？</h3>
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        第一次确认 (1/2)
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mb-4">
                    <p className="text-[13px] text-amber-800 dark:text-amber-300">
                      即将删除用户：<span className="font-bold">{deleteUserConfirm.user.username}</span>
                    </p>
                    <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-2">
                      该用户将被强制下线，所有数据将被清除。
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteUserConfirm({ step: 0, user: null })}
                      className="flex-1 h-11 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => setDeleteUserConfirm({ ...deleteUserConfirm, step: 2 })}
                      className="flex-1 h-11 rounded-full bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors"
                    >
                      继续 (1/2)
                    </button>
                  </div>
                </>
              )}

              {deleteUserConfirm.step === 2 && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                      <Trash2 size={20} className="text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">最后确认！</h3>
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        第二次确认 (2/2)
                      </p>
                    </div>
                  </div>

                  <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-300 dark:border-red-500/40 rounded-xl p-4 mb-4">
                    <p className="text-[14px] text-red-800 dark:text-red-300 font-bold mb-3">
                      🚨 危险操作警告
                    </p>
                    <p className="text-[13px] text-red-700 dark:text-red-400 leading-relaxed">
                      您即将<span className="font-bold underline">永久删除</span>用户 <span className="font-bold text-red-900 dark:text-red-200">{deleteUserConfirm.user.username}</span>。
                    </p>
                    <p className="text-[12px] text-red-600 dark:text-red-400 mt-3 font-medium">
                      此操作无法撤销，请三思而后行！
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteUserConfirm({ step: 0, user: null })}
                      className="flex-1 h-11 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleDeleteUser}
                      className="flex-1 h-11 rounded-full bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
                    >
                      确认删除 (2/2)
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kick User Confirmation Modal */}
      <AnimatePresence>
        {kickUserConfirm.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setKickUserConfirm({ open: false, roomId: null, username: null })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[380px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center">
                  <UserX size={20} className="text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">确认踢出用户？</h3>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    此操作将立即生效
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-orange-800 dark:text-orange-300">
                  将 <span className="font-bold">{kickUserConfirm.username}</span> 踢出房间
                </p>
                <p className="text-[12px] text-orange-700 dark:text-orange-400 mt-2">
                  用户将立即离开房间，但账号仍然保留，可以重新加入。
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setKickUserConfirm({ open: false, roomId: null, username: null })}
                  className="flex-1 h-11 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleKickUserConfirm}
                  className="flex-1 h-11 rounded-full bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors"
                >
                  确认踢出
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kicked from Room Notification Modal */}
      <AnimatePresence>
        {kickedFromRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeKickedModal}
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
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">已被移出房间</h3>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  {kickedFromRoom.reason}
                </p>
                <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-2">
                  房间：<span className="font-semibold">{kickedFromRoom.roomName}</span>
                </p>
              </div>

              <button
                onClick={closeKickedModal}
                className="w-full h-11 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                我知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kick Cooldown Modal - When trying to join but still in cooldown */}
      <AnimatePresence>
        {kickCooldownInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeKickCooldownModal}
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
                  <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">无法加入房间</h3>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 mb-4">
                <p className="text-[13px] text-red-800 dark:text-red-300 font-medium mb-2">
                  房间：<span className="font-bold">{kickCooldownInfo.roomName}</span>
                </p>
                <p className="text-[13px] text-red-700 dark:text-red-400 leading-relaxed">
                  {kickCooldownInfo.error}
                </p>
              </div>

              <button
                onClick={closeKickCooldownModal}
                className="w-full h-11 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-bold hover:bg-black dark:hover:bg-zinc-200 transition-colors"
              >
                我知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 全局弹窗容器 */}
      <DialogContainer />
    </>
  );
}

export default App;
