import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../store';
import { Hash, ArrowLeft, Copy, Check } from 'lucide-react';

export default function ChatArea() {
  const { currentRoom, messages, sendMessage, user, leaveRoom } = useChatStore();
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200/40 dark:border-zinc-700/40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl absolute top-0 left-0 right-0 z-20 transition-colors duration-300 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={leaveRoom}
            className="p-2 -ml-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[17px] font-bold text-zinc-900 dark:text-white">{currentRoom.name}</span>
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
              className={`flex gap-3 py-2 ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              {/* Avatar - left side for others */}
              {!isMe && (
                <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {msg.sender.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Content */}
              <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
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
                <div className={`px-4 py-2.5 rounded-2xl ${
                  isMe 
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-black rounded-br-md' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-md'
                }`}>
                  <p className="text-[15px] leading-relaxed break-words">
                    {msg.text}
                  </p>
                </div>
                <span className={`text-[11px] text-zinc-400 dark:text-zinc-600 mt-1 block ${isMe ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Avatar - right side for me */}
              {isMe && (
                <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {msg.sender.slice(0, 2).toUpperCase()}
                </div>
              )}
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
        <form onSubmit={handleSend} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {user?.username?.slice(0, 2).toUpperCase()}
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What's happening?"
            className="flex-1 h-12 px-4 bg-transparent text-[17px] text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none"
          />
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
  );
}
