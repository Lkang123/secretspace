import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker from 'emoji-picker-react';
import { useChatStore } from '../store';
import { Hash, ArrowLeft, Copy, Check, Reply, X, Smile } from 'lucide-react';
import { getAvatarColor, getInitials, getAvatarUrl, getPresetAvatarUrl } from '../utils';

export default function ChatArea() {
  const { currentRoom, rooms, messages, sendMessage, user, leaveRoom, setReplyingTo, replyingTo, userAvatars } = useChatStore();
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get real-time room data (for user count)
  const activeRoom = rooms.find(r => r.id === currentRoom?.id) || currentRoom;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleEmojiClick = (emoji) => {
    const emojiChar = typeof emoji === 'string' ? emoji : emoji?.emoji;
    if (!emojiChar) return;

    const inputEl = inputRef.current;
    if (!inputEl) {
      setInput((prev) => prev + emojiChar);
      return;
    }

    const start = inputEl.selectionStart ?? input.length;
    const end = inputEl.selectionEnd ?? input.length;
    const newValue = input.slice(0, start) + emojiChar + input.slice(end);
    setInput(newValue);

    // Restore cursor position after React updates
    requestAnimationFrame(() => {
      const cursorPos = start + emojiChar.length;
      inputEl.focus();
      inputEl.setSelectionRange(cursorPos, cursorPos);
    });

    setShowEmojiPicker(false);
  };

  // Focus input when replying
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const copyRoomId = async () => {
    if (!currentRoom) return;
    const textToCopy = currentRoom.id;
    
    try {
      // Try modern clipboard API first (requires HTTPS)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for HTTP: use textarea + execCommand
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Silent fail - copy operation failed
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  // Empty state
  if (!currentRoom) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-black relative overflow-hidden transition-colors duration-300">
        <div className="z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center mb-6">
              <Hash size={32} className="text-white dark:text-black" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Select a room</h2>
            <p className="text-[15px] text-zinc-500 mt-2">Choose a room from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-black relative transition-colors duration-300 overflow-hidden">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-zinc-200/40 dark:border-zinc-700/40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl absolute top-0 left-0 right-0 z-20 transition-colors duration-300 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={leaveRoom}
            className="p-2 -ml-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <Hash size={16} className="text-zinc-400" />
                <span className="text-[16px] font-bold text-zinc-900 dark:text-white leading-tight">{activeRoom.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    Online
                </span>
                <span>•</span>
                <span>{activeRoom.userCount} members</span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline font-mono text-xs opacity-70">ID: {activeRoom.id}</span>
            </div>
          </div>
        </div>
        
        {/* Share/Copy ID Button */}
        <button
          onClick={copyRoomId}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-500" />
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Share ID</span>
            </>
          )}
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pt-16 pb-20 px-4 space-y-1 scroll-smooth">
        {messages.map((msg, i) => {
          const isMe = msg.senderId === user.id;
          const isSystem = msg.type === 'system';

          if (isSystem) {
            return (
              <div key={msg.id || i} className="flex justify-center py-3">
                <span className="text-[13px] text-zinc-500 dark:text-zinc-600">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <motion.div
              key={msg.id || i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`group relative flex gap-3 py-2 ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              {/* Avatar - left side for others */}
              {!isMe && (
                <img 
                  src={getPresetAvatarUrl(
                    userAvatars[msg.sender] ?? msg.senderAvatarId, 
                    msg.sender
                  )} 
                  alt={msg.sender}
                  className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
                />
              )}

              {/* Content */}
              <div className={`relative flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-bold text-zinc-900 dark:text-white">{msg.sender}</span>
                    {msg.isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                )}
                
                {/* Reply Button (Left side for me) */}
                {isMe && (
                  <button 
                    onClick={() => setReplyingTo(msg)}
                    className="absolute right-full mr-2 bottom-7 p-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reply"
                  >
                    <Reply size={12} />
                  </button>
                )}

                <div className={`relative px-4 py-2.5 rounded-2xl ${
                  isMe 
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-black rounded-br-md' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-md'
                }`}>
                  {/* Reply Quote Block */}
                  {msg.replyTo && (
                    <div className={`mb-2 pl-2 border-l-2 text-xs ${
                        isMe 
                        ? 'border-zinc-500 dark:border-zinc-400' 
                        : 'border-zinc-400 dark:border-zinc-500'
                    }`}>
                        <div className={`font-bold ${isMe ? 'text-zinc-300 dark:text-zinc-500' : 'text-zinc-600 dark:text-zinc-400'}`}>
                          {msg.replyTo.sender}
                        </div>
                        <div className={`truncate ${isMe ? 'text-zinc-400 dark:text-zinc-400' : 'text-zinc-500 dark:text-zinc-500'}`}>
                          {msg.replyTo.text}
                        </div>
                    </div>
                  )}

                  <p className="text-[15px] leading-relaxed break-words">
                    {msg.text}
                  </p>
                </div>
                <span className={`text-[11px] text-zinc-400 dark:text-zinc-600 mt-1 block ${isMe ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Reply Button (Right side for others) */}
              {!isMe && (
                 <div className="flex items-end opacity-0 group-hover:opacity-100 transition-opacity pb-6">
                    <button 
                        onClick={() => setReplyingTo(msg)}
                        className="p-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                        title="Reply"
                    >
                        <Reply size={12} />
                    </button>
                 </div>
              )}

              {/* Avatar - right side for me */}
              {isMe && (
                <img 
                  src={getPresetAvatarUrl(user?.avatarId, msg.sender)} 
                  alt={msg.sender}
                  className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
                />
              )}
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
        {/* Reply Preview Bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800"
            >
              <div className="flex flex-col overflow-hidden border-l-2 border-zinc-400 pl-3 my-1">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 mb-0.5">
                  Replying to {replyingTo.sender}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {replyingTo.text}
                </span>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4">
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <img 
              src={getPresetAvatarUrl(user?.avatarId, user?.username)} 
              alt={user?.username}
              className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
            />
            <div className="flex-1 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What's happening?"
                className="flex-1 h-12 px-4 bg-transparent text-[17px] text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Smile size={20} />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-11 right-0 z-50">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => handleEmojiClick(emojiData.emoji)}
                      lazyLoadEmojis
                    />
                  </div>
                )}
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={!input.trim()}
              className="h-9 px-5 bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-black text-[15px] font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Post
            </motion.button>
          </form>
        </div>
      </div>
      </div>
  );
}
