import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../store';
import { useThemeStore } from '../themeStore';
import { Plus, Hash, Trash2, LogOut, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';
import Modal from './Modal';

export default function Sidebar() {
  const { rooms, currentRoom, user, createRoom, joinRoom, dismissRoom, logout } = useChatStore();
  const { theme, toggleTheme } = useThemeStore();
  const [isCreating, setIsCreating] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [inputValue, setInputValue] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, roomId: null, roomName: '' });

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
    <div className="w-72 h-screen flex flex-col bg-white/90 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-zinc-200/40 dark:border-zinc-700/40 transition-colors duration-300 shadow-lg">
      {/* Header / User Info */}
      <div className="p-4 backdrop-blur-md bg-white/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between px-2 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center">
              <span className="text-sm font-bold text-white dark:text-black">
                {user?.username?.slice(0, 2).toUpperCase()}
              </span>
            </div>
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

            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="group relative flex items-center"
              >
                <button
                  onClick={() => joinRoom(room.id)}
                  className={clsx(
                    "flex-1 h-12 flex items-center gap-3 px-3 rounded-full text-left transition-all duration-200 backdrop-blur-md",
                    isActive 
                      ? "bg-zinc-100/70 dark:bg-zinc-800/70 text-zinc-900 dark:text-white font-bold shadow-sm" 
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50"
                  )}
                >
                  <Hash size={20} className="shrink-0" />
                  <span className="flex-1 text-[15px] truncate">{room.name}</span>
                </button>

                {/* User Count - Always Visible */}
                {room.userCount > 0 && (
                  <span className="min-w-[24px] h-6 flex items-center justify-center text-xs font-bold rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black mx-2 flex-shrink-0">
                    {room.userCount}
                  </span>
                )}

                {/* Delete Button - Hover Only */}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteModal({ open: true, roomId: room.id, roomName: room.name });
                    }}
                    className="p-2 rounded-full text-zinc-400 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
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
    </div>
  );
}
