import React, { useState, useRef, useEffect, Suspense, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'yet-another-react-lightbox/styles.css';
import { useChatStore } from '../store';
import { ArrowLeft, Reply, X, Smile, Image, Loader2, MessageCircle, Undo2, Trash2 } from 'lucide-react';
import { showAlert, showConfirm } from './Dialog';
import { getPresetAvatarUrl } from '../utils';

const EmojiPickerLazy = React.lazy(() => import('emoji-picker-react'));

const LightboxLazy = React.lazy(async () => {
  const [mod, zoomMod] = await Promise.all([
    import('yet-another-react-lightbox'),
    import('yet-another-react-lightbox/plugins/zoom'),
  ]);
  const Lightbox = mod.default;
  const Zoom = zoomMod.default;
  return {
    default: (props) => (
      <Lightbox
        plugins={[Zoom]}
        {...props}
      />
    ),
  };
});

export default function DMChatArea() {
  const { 
    currentDM, dmMessages, sendDMMessage, user, closeDM, setReplyingTo, replyingTo,
    uploadingImage, sendDMImageMessage, connected, clearDMUnread,
    // 消息撤回/删除
    recallDMMessage, deleteDMMessage
  } = useChatStore();
  
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [expiredImages, setExpiredImages] = useState(() => new Set());
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevMessageCountRef = useRef(0); // 用于判断是新消息还是初次加载
  const isInitialLoadRef = useRef(true); // 是否首次加载

  // 点击外部关闭消息菜单
  useEffect(() => {
    if (!activeMenuMsgId) return;
    const handleClick = () => setActiveMenuMsgId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeMenuMsgId]);

  // 智能滚动：首次加载用 instant，新消息用 smooth
  const scrollToBottom = useCallback((instant = false) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: instant ? 'auto' : 'smooth' 
    });
  }, []);

  const markImageExpired = useCallback((url) => {
    if (!url) return;
    setExpiredImages((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  // Memoize lightbox slides to avoid recalculation on every render
  const lightboxSlides = useMemo(() => {
    return dmMessages.filter(m => m.imageUrl && !expiredImages.has(m.imageUrl)).map(m => ({ src: m.imageUrl }));
  }, [dmMessages, expiredImages]);

  // 切换会话时重置初始加载状态
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessageCountRef.current = 0;
  }, [currentDM?.id]);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currentCount = dmMessages.length;
    
    // 判断是否是首次加载或批量加载（进入会话）
    const isInitialOrBulkLoad = isInitialLoadRef.current || 
      (currentCount - prevCount > 1) || 
      prevCount === 0;
    
    // 首次/批量加载用 instant，单条新消息用 smooth
    scrollToBottom(isInitialOrBulkLoad);
    
    // 更新计数
    prevMessageCountRef.current = currentCount;
    isInitialLoadRef.current = false;
    
    // 延迟滚动，防止图片加载导致高度变化（也用 instant）
    const timer = setTimeout(() => scrollToBottom(true), 100);
    
    // 如果有新消息且当前正在查看该会话，清除未读
    if (currentDM) {
      clearDMUnread(currentDM.id);
    }
    
    return () => clearTimeout(timer);
  }, [dmMessages, currentDM, clearDMUnread, scrollToBottom]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportChange = () => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 50);
    };
    window.visualViewport.addEventListener('resize', handleViewportChange);
    return () => window.visualViewport.removeEventListener('resize', handleViewportChange);
  }, []);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

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

    requestAnimationFrame(() => {
      const cursorPos = start + emojiChar.length;
      inputEl.focus();
      inputEl.setSelectionRange(cursorPos, cursorPos);
    });

    setShowEmojiPicker(false);
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, 50);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() && !previewImage) return;
    
    // 发送文字
    if (input.trim()) {
      sendDMMessage(input);
      setInput('');
    }
    
    // 发送图片
    if (previewImage?.file) {
      await sendDMImageMessage(previewImage.file);
      // 清理预览
      URL.revokeObjectURL(previewImage.preview);
      setPreviewImage(null);
    }
  };

  // 图片处理函数
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      showAlert('只支持图片文件', { variant: 'warning' });
      return;
    }
    
    if (file.size > 20 * 1024 * 1024) {
      showAlert('图片最大支持20MB', { variant: 'warning' });
      return;
    }
    
    const preview = URL.createObjectURL(file);
    setPreviewImage({ file, preview });
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const preview = URL.createObjectURL(file);
          setPreviewImage({ file, preview });
        }
        break;
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    
    if (file.type.startsWith('image/')) {
      const preview = URL.createObjectURL(file);
      setPreviewImage({ file, preview });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleSendImage = async () => {
    if (!previewImage?.file) return;
    
    await sendDMImageMessage(previewImage.file);
    
    URL.revokeObjectURL(previewImage.preview);
    setPreviewImage(null);
  };

  const cancelImagePreview = () => {
    if (previewImage?.preview) {
      URL.revokeObjectURL(previewImage.preview);
    }
    setPreviewImage(null);
  };

  // Empty state
  if (!currentDM) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-black relative overflow-hidden transition-colors duration-300">
        <div className="z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center mb-6">
            <MessageCircle size={32} className="text-white dark:text-black" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Select a conversation</h2>
          <p className="text-[15px] text-zinc-500 mt-2">Choose a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 flex flex-col bg-white dark:bg-black relative transition-colors duration-300 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-zinc-200/40 dark:border-zinc-700/40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl absolute top-0 left-0 right-0 z-20 transition-colors duration-300 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={closeDM}
            className="p-2 -ml-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          
          <img
            src={getPresetAvatarUrl(null, currentDM.otherUser?.name)}
            alt={currentDM.otherUser?.name}
            className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700"
          />
          
          <div className="flex flex-col">
            <span className="text-[16px] font-bold text-zinc-900 dark:text-white leading-tight">
              {currentDM.otherUser?.name}
            </span>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
              {connected ? 'Online' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pb-20 px-4 space-y-1 scroll-smooth pt-16">
        {dmMessages.map((msg, i) => {
          const isMe = msg.senderId === user.id;

          return (
            <div
              key={msg.id || i}
              className={`group relative flex gap-3 py-2 ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              {/* Avatar - left side for others */}
              {!isMe && (
                <img 
                  src={getPresetAvatarUrl(msg.senderAvatarId, msg.sender)} 
                  alt={msg.sender}
                  className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
                />
              )}

              {/* Content */}
              <div className={`relative flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Action Menu - 点击消息气泡显示，只有有可用操作时才显示 */}
                {activeMenuMsgId === msg.id && (!msg.recalled || isMe || user?.isAdmin) && (
                  <div 
                    className={`absolute ${isMe ? 'right-full mr-2' : 'left-full ml-2'} top-1/2 -translate-y-1/2 z-10`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-0.5 bg-white dark:bg-zinc-900 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 px-1 py-0.5">
                      {/* 回复 - 只有未撤回的消息可以回复 */}
                      {!msg.recalled && (
                        <button 
                          onClick={() => { setReplyingTo(msg); setActiveMenuMsgId(null); }}
                          className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="回复"
                        >
                          <Reply size={14} />
                        </button>
                      )}
                      {/* 撤回 - 自己的未撤回消息 */}
                      {isMe && !msg.recalled && (
                        <button 
                          onClick={async () => {
                            const res = await recallDMMessage(msg.id);
                            if (!res.success) showAlert(res.error, { variant: 'danger' });
                            setActiveMenuMsgId(null);
                          }}
                          className="p-1.5 rounded-full text-zinc-500 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="撤回 (2分钟内)"
                        >
                          <Undo2 size={14} />
                        </button>
                      )}
                      {/* 删除 - 自己的已撤回消息 或 管理员任意消息 */}
                      {((isMe && msg.recalled) || user?.isAdmin) && (
                        <button 
                          onClick={async () => {
                            const confirmed = await showConfirm('确定要删除这条消息吗？', { variant: 'danger' });
                            if (confirmed) {
                              const res = await deleteDMMessage(msg.id);
                              if (!res.success) showAlert(res.error, { variant: 'danger' });
                            }
                            setActiveMenuMsgId(null);
                          }}
                          className="p-1.5 rounded-full text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Recalled message placeholder */}
                {msg.recalled ? (
                  <div 
                    className={`rounded-2xl px-4 py-2.5 cursor-pointer select-none ${
                      isMe 
                        ? 'bg-zinc-200 dark:bg-zinc-800 rounded-br-md' 
                        : 'bg-zinc-100 dark:bg-zinc-800 rounded-bl-md'
                    }`}
                    onClick={(e) => { e.stopPropagation(); setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id); }}
                  >
                    <span className="text-[13px] text-zinc-400 dark:text-zinc-500 italic">
                      消息已撤回
                    </span>
                  </div>
                ) : (
                <div 
                  className={`relative rounded-2xl overflow-hidden cursor-pointer select-none ${
                    msg.imageUrl && !msg.text 
                      ? '' 
                      : isMe 
                        ? 'bg-black dark:bg-white text-white dark:text-black rounded-br-md px-4 py-2.5' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-md px-4 py-2.5'
                  }`}
                  onClick={(e) => { e.stopPropagation(); setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id); }}
                >
                  {/* Reply Quote Block */}
                  {msg.replyTo && (
                    <div className={`mb-2 pl-2 border-l-2 text-xs ${
                        isMe 
                        ? 'border-zinc-500' 
                        : 'border-zinc-400 dark:border-zinc-500'
                    }`}>
                        <div className={`font-bold ${isMe ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-600 dark:text-zinc-400'}`}>
                          {msg.replyTo.sender}
                        </div>

                        {/* Replied image thumbnail */}
                        {msg.replyTo.imageUrl && !expiredImages.has(msg.replyTo.imageUrl) && (
                          <button
                            type="button"
                            onClick={() => {
                              const imageMessages = dmMessages.filter(m => m.imageUrl && !expiredImages.has(m.imageUrl));
                              const index = imageMessages.findIndex(m => m.imageUrl === msg.replyTo.imageUrl);
                              setLightboxIndex(index >= 0 ? index : 0);
                              setLightboxOpen(true);
                            }}
                            className="mt-1 inline-block rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800"
                          >
                            <img
                              src={msg.replyTo.imageUrl}
                              alt="Replied image"
                              className="max-w-[140px] max-h-[100px] object-contain block"
                              onError={() => markImageExpired(msg.replyTo.imageUrl)}
                            />
                          </button>
                        )}
                        {msg.replyTo.imageUrl && expiredImages.has(msg.replyTo.imageUrl) && (
                          <div className="mt-1 inline-flex items-center justify-center max-w-[140px] h-[72px] rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 text-center px-2">
                            图片已过期（超过15天自动清理）
                          </div>
                        )}

                        {msg.replyTo.text && (
                          <div className={`truncate ${isMe ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-500'} ${msg.replyTo.imageUrl ? 'mt-1' : ''}`}>
                            {msg.replyTo.text}
                          </div>
                        )}
                    </div>
                  )}

                  {/* 图片消息 */}
                  {msg.imageUrl && !expiredImages.has(msg.imageUrl) && (
                    <img
                      src={msg.imageUrl}
                      alt="Shared image"
                      className="max-w-[280px] max-h-[280px] rounded-xl cursor-zoom-in hover:opacity-90 transition-opacity"
                      onLoad={() => scrollToBottom(true)}
                      onError={() => markImageExpired(msg.imageUrl)}
                      onClick={() => {
                        const imageMessages = dmMessages.filter(m => m.imageUrl && !expiredImages.has(m.imageUrl));
                        const index = imageMessages.findIndex(m => m.imageUrl === msg.imageUrl);
                        setLightboxIndex(index >= 0 ? index : 0);
                        setLightboxOpen(true);
                      }}
                    />
                  )}
                  {msg.imageUrl && expiredImages.has(msg.imageUrl) && (
                    <div className="max-w-[280px] max-h-[280px] rounded-xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center px-4 py-6 text-xs text-zinc-500 dark:text-zinc-400 text-center">
                      <span className="font-medium mb-1">图片已过期</span>
                      <span className="text-[11px] opacity-80">超过15天的图片会被自动清理</span>
                    </div>
                  )}

                  {/* 文本消息 */}
                  {msg.text && (
                    <p className={`text-[15px] leading-relaxed break-words ${msg.imageUrl ? 'mt-2' : ''}`}>
                      {msg.text}
                    </p>
                  )}
                </div>
                )}
                <span className={`text-[11px] text-zinc-400 dark:text-zinc-600 mt-1 block ${isMe ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Avatar - right side for me */}
              {isMe && (
                <img 
                  src={getPresetAvatarUrl(user?.avatarId, msg.sender)} 
                  alt={msg.sender}
                  className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
                />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
            className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {replyingTo.imageUrl && !expiredImages.has(replyingTo.imageUrl) && (
                <img 
                  src={replyingTo.imageUrl} 
                  alt="Reply preview" 
                  className="w-10 h-10 rounded-md object-cover shrink-0"
                  onError={() => markImageExpired(replyingTo.imageUrl)}
                />
              )}
              {replyingTo.imageUrl && expiredImages.has(replyingTo.imageUrl) && (
                <div className="w-10 h-10 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 dark:text-zinc-400 text-center px-1">
                  已过期
                </div>
              )}
              <div className="flex flex-col overflow-hidden border-l-2 border-zinc-400 pl-3">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 mb-0.5">
                  Replying to {replyingTo.sender}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {replyingTo.text || (replyingTo.imageUrl ? '[图片]' : '')}
                </span>
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 shrink-0"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}

        {/* Image Preview */}
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
            className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800"
          >
            <div className="relative inline-block">
              <img
                src={previewImage.preview}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg"
              />
              <button
                onClick={cancelImagePreview}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
              >
                <X size={12} />
                </button>
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
              </div>
            </motion.div>
        )}

        <div className="p-4">
          <form onSubmit={handleSend} className="flex items-center gap-2 sm:gap-3">
            <img 
              src={getPresetAvatarUrl(user?.avatarId, user?.username)} 
              alt={user?.username}
              className="w-10 h-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-700"
            />
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={handleInputFocus}
                onPaste={handlePaste}
                placeholder="Type a message..."
                className="flex-1 h-12 px-3 sm:px-4 bg-transparent text-[15px] sm:text-[17px] text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none min-w-0"
              />
              {/* Image Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 w-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
                title="Upload image"
              >
                <Image size={18} />
              </button>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <>
                    <div 
                      className="fixed inset-0 bg-black/30 z-40 md:hidden"
                      onClick={() => setShowEmojiPicker(false)}
                    />
                    <div className="hidden md:block absolute bottom-11 right-0 z-50">
                      <Suspense fallback={null}>
                        <EmojiPickerLazy
                          onEmojiClick={(emojiData) => handleEmojiClick(emojiData.emoji)}
                          lazyLoadEmojis
                          width={350}
                          height={400}
                        />
                      </Suspense>
                    </div>
                    <div className="md:hidden fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[350px]">
                      <Suspense fallback={null}>
                        <EmojiPickerLazy
                          onEmojiClick={(emojiData) => handleEmojiClick(emojiData.emoji)}
                          lazyLoadEmojis
                          width="100%"
                          height={350}
                        />
                      </Suspense>
                    </div>
                  </>
                )}
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={(!input.trim() && !previewImage) || uploadingImage}
              className="h-9 px-4 sm:px-5 bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-black text-[14px] sm:text-[15px] font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap"
            >
              {uploadingImage ? 'Sending...' : 'Send'}
            </motion.button>
          </form>
        </div>
      </div>

      {/* Image Lightbox */}
      <Suspense fallback={null}>
        <LightboxLazy
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          slides={lightboxSlides}
          zoom={{
            maxZoomPixelRatio: 5,
            zoomInMultiplier: 2,
            doubleTapDelay: 300,
            doubleClickDelay: 300,
            doubleClickMaxStops: 2,
            keyboardMoveDistance: 50,
            wheelZoomDistanceFactor: 100,
            pinchZoomDistanceFactor: 100,
            scrollToZoom: true
          }}
          carousel={{ finite: true }}
          controller={{ closeOnBackdropClick: true }}
          styles={{
            container: { backgroundColor: 'rgba(0, 0, 0, 0.9)' }
          }}
        />
      </Suspense>
    </div>
  );
}
