import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../store';
import { useThemeStore } from '../themeStore';
import { Plus, Hash, Trash2, LogOut, Sun, Moon, X, Shield, Clock } from 'lucide-react';
import clsx from 'clsx';
import Modal from './Modal';
import { getAvatarColor, getInitials, getAvatarUrl, PRESET_AVATARS, getPresetAvatarUrl } from '../utils';

export default function Sidebar() {
  const { rooms, adminRooms, currentRoom, user, createRoom, joinRoom, dismissRoom, logout, updateAvatar, fetchAdminRooms, openAdminPanel } = useChatStore();
  const { theme, toggleTheme } = useThemeStore();
  const [isCreating, setIsCreating] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [inputValue, setInputValue] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, roomId: null, roomName: '' });
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    if (mode === 'create') {
        const roomId = await createRoom(inputValue);
        joinRoom(roomId);
    } else {
        // Join by ID
        joinRoom(inputValue);
    }
    
    setInputValue('');
    setIsCreating(false);
  };

  return (
    <div className="w-full md:w-72 h-screen flex flex-col bg-white/90 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-zinc-200/40 dark:border-zinc-700/40 transition-colors duration-300 shadow-lg">
      {/* Header / User Info */}
      <div className="p-4 backdrop-blur-md bg-white/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between px-2 mb-6">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAvatarPicker(true)}
              className="relative group"
              title="Change avatar"
            >
              <img 
                src={getPresetAvatarUrl(user?.avatarId, user?.username)} 
                alt={user?.username}
                className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 cursor-pointer ring-2 ring-transparent group-hover:ring-zinc-400 dark:group-hover:ring-zinc-500 transition-all"
              />
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[10px] font-medium">Edit</span>
              </div>
            </button>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white leading-tight">
                {user?.username}
              </span>
              <span className="text-[13px] text-zinc-500 dark:text-zinc-500">
                {user?.isAdmin ? '@admin' : '@user'}
              </span>
            </div>
          </div>
          
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-2">
            {!isCreating ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => { setIsCreating(true); setMode('create'); }}
                className="flex-1 h-11 flex items-center justify-center gap-2 rounded-full bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-[15px] font-bold text-white dark:text-black transition-colors"
              >
                <Plus size={14} />
                <span>New / Join</span>
              </motion.button>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                    <input
                        autoFocus
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onBlur={() => !inputValue && setIsCreating(false)}
                        placeholder={mode === 'create' ? "Room Name..." : "Room ID..."}
                        className="w-full h-11 pl-4 pr-16 text-[15px] rounded-full bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md border border-zinc-300/40 dark:border-zinc-600/40 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-900/60 dark:focus:border-white/60 focus:ring-1 focus:ring-zinc-900/30 dark:focus:ring-white/30 transition-all shadow-sm"
                    />
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur
                            setMode(mode === 'create' ? 'join' : 'create');
                        }}
                        className="absolute right-1 top-1 bottom-1 px-3 rounded-full bg-zinc-100/60 dark:bg-zinc-800/60 backdrop-blur-sm text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors"
                    >
                        {mode === 'create' ? 'CREATE' : 'JOIN'}
                    </button>
                </div>
              </form>
            )}
        </div>
        {user?.isAdmin && (
          <button
            onClick={() => {
              openAdminPanel();
              fetchAdminRooms();
            }}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-full border border-amber-400/70 bg-amber-50/90 dark:bg-amber-500/10 text-[13px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
          >
            <Shield size={14} />
            <span>Admin Panel</span>
          </button>
        )}
      </div>

      {/* Room List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        <div className="px-3 py-2 text-[13px] font-bold text-zinc-500 dark:text-zinc-500">
          Rooms
        </div>
        <AnimatePresence initial={false}>
          {rooms.map((room) => {
            const isActive = currentRoom?.id === room.id;
            const canDelete = user?.isAdmin || room.ownerId === user?.id;
            
            const isCooldown = room.cooldownUntil && room.cooldownUntil > now;
            const cooldownSeconds = isCooldown ? Math.ceil((room.cooldownUntil - now) / 1000) : 0;
            const cooldownText = isCooldown 
              ? `${Math.floor(cooldownSeconds / 60)}:${(cooldownSeconds % 60).toString().padStart(2, '0')}` 
              : null;

            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="group relative flex items-center"
              >
                <button
                  onClick={() => {
                    if (isCooldown) {
                       // Show cooldown modal logic is in store/App via joinRoom, 
                       // but joinRoom handles emitting which returns error.
                       // We can just call joinRoom and let it fail (which shows modal), 
                       // OR prevent it here.
                       // Let's call joinRoom so it triggers the nice modal in App.jsx
                       joinRoom(room.id);
                    } else {
                       joinRoom(room.id);
                    }
                  }}
                  className={clsx(
                    "group/btn flex-1 h-12 flex items-center justify-between px-3 rounded-full transition-all duration-200 backdrop-blur-md relative overflow-hidden",
                    isActive 
                      ? "bg-zinc-100/70 dark:bg-zinc-800/70 text-zinc-900 dark:text-white font-bold shadow-sm" 
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50",
                    isCooldown && "opacity-70"
                  )}
                >
                  {/* Left: Icon + Name + Count */}
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      isActive ? "bg-zinc-900 dark:bg-white text-white dark:text-black" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
                      isCooldown && "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                    )}>
                        {isCooldown ? <Clock size={14} /> : <Hash size={14} />}
                    </div>
                    <div className="flex flex-col overflow-hidden items-start">
                        <span className="truncate text-[14px] font-medium leading-tight">{room.name}</span>
                        {isCooldown ? (
                          <span className="text-[11px] text-red-500 dark:text-red-400 font-medium flex items-center gap-1">
                             Available in {cooldownText}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {room.userCount} {room.userCount === 1 ? 'member' : 'members'}
                          </span>
                        )}
                    </div>
                  </div>

                  {/* Right: Badges + Actions */}
                  <div className="flex items-center gap-1 pl-2 shrink-0">
                    {/* Unread Count */}
                    {room.unreadCount > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold rounded-full bg-red-500 text-white shadow-sm">
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </span>
                    )}

                    {/* Delete Button (Hover only) */}
                    {canDelete && (
                      <div
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModal({ open: true, roomId: room.id, roomName: room.name });
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 -mr-1"
                      >
                        <Trash2 size={14} />
                      </div>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bottom User Actions */}
      <div className="p-4 border-t border-zinc-200/40 dark:border-zinc-700/40 backdrop-blur-md bg-white/50 dark:bg-zinc-900/50">
          <button
            onClick={logout}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-full text-zinc-500 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-white transition-all backdrop-blur-md shadow-sm"
          >
            <LogOut size={20} />
            <span className="text-[15px] font-medium">Log out</span>
          </button>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, roomId: null, roomName: '' })}
        onConfirm={() => dismissRoom(deleteModal.roomId)}
        title="Delete Room?"
        message={`This will permanently delete "${deleteModal.roomName}" and all its messages. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
      />

      {/* Avatar Picker Modal */}
      <AnimatePresence>
        {showAvatarPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAvatarPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 w-full max-w-[360px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Choose Avatar</h3>
                <button
                  onClick={() => setShowAvatarPicker(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>
              
              <div className="grid grid-cols-5 gap-2">
                {PRESET_AVATARS.map((seed, index) => (
                  <button
                    key={seed}
                    onClick={async () => {
                      await updateAvatar(index);
                      setShowAvatarPicker(false);
                    }}
                    className={clsx(
                      "w-14 h-14 rounded-full overflow-hidden ring-2 transition-all hover:scale-110",
                      user?.avatarId === index 
                        ? "ring-blue-500" 
                        : "ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-600"
                    )}
                  >
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
                      alt={seed}
                      className="w-full h-full bg-zinc-200 dark:bg-zinc-700"
                    />
                  </button>
                ))}
              </div>

              <p className="text-xs text-zinc-500 text-center mt-4">
                Click an avatar to select it
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
