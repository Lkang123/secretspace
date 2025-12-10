import { create } from 'zustand';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { playNotificationSound, updateTitleNotification } from './utils';

const MAX_MESSAGES = 300;

// Socket.io 客户端配置 - 优化连接稳定性
const socket = io({
  // 重连配置
  reconnection: true,           // 启用自动重连
  reconnectionAttempts: 10,     // 最多重连10次
  reconnectionDelay: 1000,      // 首次重连延迟1秒
  reconnectionDelayMax: 5000,   // 最大重连延迟5秒
  randomizationFactor: 0.5,     // 随机因子，避免所有客户端同时重连
  
  // 超时配置
  timeout: 20000,               // 连接超时20秒
  
  // 传输配置
  transports: ['websocket', 'polling'], // 优先使用 WebSocket
  upgrade: true,                // 允许从 polling 升级到 websocket
});

let isInitialized = false; // Prevent duplicate listeners from StrictMode

// Check if there's a saved session (to determine initial restoring state)
const hasSavedSession = !!localStorage.getItem('chat_session');

export const useChatStore = create((set, get) => ({
  socket,
  user: null,
  rooms: [],
  adminRooms: [],
  currentRoom: null,
  messages: [],
  messageCache: {}, // Cache messages per room: { roomId: [messages] }
  connected: false,
  showWelcomeModal: false,
  showAdminWelcomeModal: false,
  showAdminPanel: false,
  isRestoring: hasSavedSession, // True if we have a session to restore
  replyingTo: null, // New state for reply
  userAvatars: {}, // Cache: { username: avatarId }
  roomDismissedInfo: null, // { roomName, message } when a room is dismissed
  roomBanner: null, // { message, createdAt, createdBy } current room's banner
  forceLogoutMessage: null, // { reason } or null - for when user is deleted by admin
  kickedFromRoom: null, // { roomName, reason } or null - for when kicked from room
  kickCooldownInfo: null, // { roomName, error } or null - for when trying to join but still in cooldown
  
  // DM 私聊相关状态
  dmList: [], // 私聊会话列表
  currentDM: null, // 当前私聊会话 { id, otherUser }
  dmMessages: [], // 当前私聊消息
  dmUnreadTotal: 0, // 私聊未读总数
  showDMPanel: false, // 是否显示私聊面板
  
  // 全局通知状态
  globalUnreadCount: 0,
  
  // 图片上传相关状态
  uploadingImage: false, // 是否正在上传图片
  pendingImage: null, // 待发送的图片 { file, preview, url }
  
  closeWelcomeModal: () => {
    const { user } = get();
    // Mark this user as having seen the welcome modal
    if (user) {
      localStorage.setItem(`welcome_seen_${user.id}`, 'true');
    }
    set({ showWelcomeModal: false });
  },

  closeAdminWelcomeModal: () => {
    set({ showAdminWelcomeModal: false });
  },

  openAdminPanel: () => {
    const { user } = get();
    if (!user?.isAdmin) return;
    set({ showAdminPanel: true });
  },

  closeAdminPanel: () => {
    set({ showAdminPanel: false });
  },

  closeRoomDismissedModal: () => {
    set({ roomDismissedInfo: null });
  },

  closeKickedModal: () => {
    set({ kickedFromRoom: null });
  },

  closeKickCooldownModal: () => {
    set({ kickCooldownInfo: null });
  },

  // DM 相关方法
  openDMPanel: () => set({ showDMPanel: true }),
  closeDMPanel: () => set({ showDMPanel: false, currentDM: null, dmMessages: [] }),
  
  clearPendingImage: () => {
    const { pendingImage } = get();
    if (pendingImage?.preview) {
      URL.revokeObjectURL(pendingImage.preview);
    }
    set({ pendingImage: null });
  },

  clearDMUnread: (conversationId) => {
    set((state) => {
      const newDmList = state.dmList.map(conv => 
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      );
      const dmUnreadTotal = newDmList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      return { dmList: newDmList, dmUnreadTotal };
    });
    socket.emit('mark_dm_read', conversationId);
  },

  resetGlobalUnread: () => {
    set({ globalUnreadCount: 0 });
    updateTitleNotification(0);
  },

  // Actions
  initSocket: () => {
    // Prevent duplicate initialization (React StrictMode calls useEffect twice)
    if (isInitialized) return;
    isInitialized = true;

    // 监听可见性变化
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // 清除标题通知
        get().resetGlobalUnread();
        
        // 检测连接状态，如果断开则强制重连
        if (!socket.connected) {
          socket.connect();
        } else {
          // 即使看起来已连接，也发送一个 ping 检测真实连接状态
          // 如果 5 秒内没收到响应，强制重连
          const pingTimeout = setTimeout(() => {
            if (!socket.connected) return;
            socket.disconnect();
            socket.connect();
          }, 5000);
          
          socket.emit('ping', () => {
            clearTimeout(pingTimeout);
          });
        }
      }
    });

    socket.on('connect', () => {
      set({ connected: true });
      // Auto-login on reconnect
      const session = localStorage.getItem('chat_session');
      if (session) {
        const { username, password, userId } = JSON.parse(session);
        // If user is already set (from memory), we might not need to login again, 
        // but socket needs to be re-associated with the user data on server.
        get().login(username, password, true).then((result) => {
            // Session restore complete
            set({ isRestoring: false });
            if (result.success) {
                // Auto-join last room
                const lastRoomId = localStorage.getItem('last_room_id');
                if (lastRoomId) {
                    get().joinRoom(lastRoomId);
                }
            } else {
                // Login failed, clear invalid session
                localStorage.removeItem('chat_session');
                localStorage.removeItem('last_room_id');
            }
        }).catch(() => {
            // Error during login, clear session and stop restoring
            set({ isRestoring: false });
            localStorage.removeItem('chat_session');
            localStorage.removeItem('last_room_id');
        });
      } else {
        // No session to restore
        set({ isRestoring: false });
      }
    });

    socket.on('disconnect', (reason) => {
      set({ connected: false });
      
      // 如果是服务器主动断开，需要手动重连
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    // 重连事件处理
    socket.on('reconnect', (attemptNumber) => {
      toast.success('连接已恢复', { duration: 2000 });
      
      // 重连后自动恢复会话
      const session = localStorage.getItem('chat_session');
      if (session) {
        const { username, password } = JSON.parse(session);
        get().login(username, password, true).then((result) => {
          if (result.success) {
            const lastRoomId = localStorage.getItem('last_room_id');
            if (lastRoomId) {
              get().joinRoom(lastRoomId);
            }
          }
        });
      }
    });

    socket.on('reconnect_attempt', () => {});

    socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect');
      toast.error('连接失败，请刷新页面重试', { duration: 5000 });
    });

    // 连接错误处理
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ connected: false });
    });
    
    socket.on('rooms_updated', (newRooms) => {
      set((state) => {
        const existingRoomsMap = new Map(state.rooms.map(r => [r.id, r]));
        const mergedRooms = newRooms.map(newRoom => ({
          ...newRoom,
          unreadCount: existingRoomsMap.get(newRoom.id)?.unreadCount || 0,
          cooldownUntil: newRoom.cooldown ? Date.now() + newRoom.cooldown * 1000 : null
        }));
        return { rooms: mergedRooms };
      });
    });

    // Listen for room notifications (new messages when outside)
    socket.on('room_notification', ({ roomId }) => {
        const { globalUnreadCount } = get();
        playNotificationSound();
        
        if (document.hidden) {
            const newCount = globalUnreadCount + 1;
            set({ globalUnreadCount: newCount });
            updateTitleNotification(newCount);
        }

        set((state) => {
            const newRooms = state.rooms.map(room => {
                if (room.id === roomId) {
                    return {
                        ...room,
                        unreadCount: (room.unreadCount || 0) + 1
                    };
                }
                return room;
            });
            
            // Clear message cache for this room to force refresh on next join
            const newCache = { ...state.messageCache };
            delete newCache[roomId];
            
            return { 
                rooms: newRooms,
                messageCache: newCache
            };
        });
    });

    // Listen for avatar updates from other users
    socket.on('user_avatar_updated', ({ username, avatarId }) => {
        set((state) => ({
            userAvatars: { ...state.userAvatars, [username]: avatarId }
        }));
    });

    // Listen for room banner updates
    socket.on('room_banner_updated', (banner) => {
        set({ roomBanner: banner });
    });

    // Listen for force logout (when admin deletes user)
    socket.on('force_logout', ({ reason }) => {
      // Immediately clear localStorage to prevent auto re-login
      localStorage.removeItem('chat_session');
      localStorage.removeItem('last_room_id');
      
      // Set force logout message to show modal
      set({ 
        forceLogoutMessage: { reason: reason || '您已被管理员强制下线' },
        user: null,
        currentRoom: null,
        messages: [],
        rooms: [],
      });
    });
    
    socket.on('receive_message', (message) => {
      const { currentRoom, messageCache, user, globalUnreadCount } = get();
      // Determine if message is from self using persistent ID
      // We might need to update how we display messages in ChatArea too if we change senderId logic
      // For now, server sends senderId which is persistentId.
      // Frontend user object should also have persistentId.
      
      // 检查是否需要通知 (非自己发送的消息)
      if (message.senderId !== user?.id) {
        if (document.hidden) {
           const newCount = globalUnreadCount + 1;
           set({ globalUnreadCount: newCount });
           updateTitleNotification(newCount);
           playNotificationSound();
        }
      }
      
// Update both current messages and cache, keeping only last MAX_MESSAGES
      set((state) => {
        const newMessages = [...state.messages, message].slice(-MAX_MESSAGES);
        const newCache = { ...state.messageCache };
        if (currentRoom) {
          newCache[currentRoom.id] = newMessages;
        }
        return { messages: newMessages, messageCache: newCache };
      });
    });

    socket.on('system_message', (msg) => {
      const { currentRoom } = get();
      const sysMsg = { 
        ...msg, 
        type: 'system', 
        id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` 
      };
      
      set((state) => {
        const newMessages = [...state.messages, sysMsg].slice(-MAX_MESSAGES);
        const newCache = { ...state.messageCache };
        if (currentRoom) {
          newCache[currentRoom.id] = newMessages;
        }
        return { messages: newMessages, messageCache: newCache };
      });
    });

    // 消息撤回事件
    socket.on('message_recalled', ({ messageId, roomId, recalledBy }) => {
      const { currentRoom, messageCache } = get();
      
      set((state) => {
        // 更新当前消息列表
        const newMessages = state.messages.map(msg => 
          (msg.id === messageId || msg.id?.toString().startsWith(messageId?.toString()))
            ? { ...msg, recalled: true }
            : msg
        );
        
        // 更新缓存
        const newCache = { ...state.messageCache };
        if (currentRoom && newCache[currentRoom.id]) {
          newCache[currentRoom.id] = newCache[currentRoom.id].map(msg =>
            (msg.id === messageId || msg.id?.toString().startsWith(messageId?.toString()))
              ? { ...msg, recalled: true }
              : msg
          );
        }
        
        return { messages: newMessages, messageCache: newCache };
      });
    });

    // 消息删除事件
    socket.on('message_deleted', ({ messageId, roomId }) => {
      const { currentRoom, messageCache } = get();
      
      set((state) => {
        // 从当前消息列表移除
        const newMessages = state.messages.filter(msg => 
          !(msg.id === messageId || msg.id?.toString().startsWith(messageId?.toString()))
        );
        
        // 从缓存移除
        const newCache = { ...state.messageCache };
        if (currentRoom && newCache[currentRoom.id]) {
          newCache[currentRoom.id] = newCache[currentRoom.id].filter(msg =>
            !(msg.id === messageId || msg.id?.toString().startsWith(messageId?.toString()))
          );
        }
        
        return { messages: newMessages, messageCache: newCache };
      });
    });

    // Listen for being kicked from room
    socket.on('kicked_from_room', ({ roomName, reason }) => {
      // Show notification
      const currentRoom = get().currentRoom;
      if (currentRoom) {
        set({ 
          currentRoom: null,
          messages: [],
          roomBanner: null,
          kickedFromRoom: { roomName, reason }
        });
        localStorage.removeItem('last_room_id');
      }
    });

    socket.on('room_dismissed', ({ text, roomName, roomId }) => {
        const { currentRoom, messageCache, rooms } = get();
        // Remove from cache and storage
        const newCache = { ...messageCache };
        if (currentRoom) {
          delete newCache[currentRoom.id];
        }
        
        localStorage.removeItem('last_room_id');
        
        // Find the room ID if not provided (fallback)
        const idToRemove = roomId || (rooms.find(r => r.name === roomName)?.id);

        set({ 
          currentRoom: null,
          messages: [],
          roomBanner: null,
          roomDismissedInfo: { roomName, message: text },
          messageCache: newCache,
          // Remove the dismissed room from the list using ID
          rooms: idToRemove ? rooms.filter(r => r.id !== idToRemove) : rooms
        });
        
        // Also fetch fresh list from server just in case
        socket.emit('get_rooms', (updatedRooms) => {
           set({ rooms: updatedRooms || [] });
        });
    });

    // Listen for admin room updates (real-time user count)
    socket.on('admin_room_updated', ({ roomId, userCount }) => {
      set((state) => ({
        adminRooms: state.adminRooms.map(room => 
          room.id === roomId ? { ...room, userCount } : room
        )
      }));
    });

    // ======= DM 私聊事件监听 =======
    
    // 接收私聊消息
    socket.on('receive_dm', ({ conversationId, message }) => {
      const { currentDM, user, globalUnreadCount } = get();
      
      // 检查是否需要通知
      if (message.senderId !== user?.id) {
        if (document.hidden) {
           const newCount = globalUnreadCount + 1;
           set({ globalUnreadCount: newCount });
           updateTitleNotification(newCount);
           playNotificationSound();
        }
      }

      // 如果是当前打开的会话，添加到消息列表
      if (currentDM && currentDM.id === conversationId) {
        set((state) => {
          const newMessages = [...state.dmMessages, message].slice(-MAX_MESSAGES);
          return { dmMessages: newMessages };
        });
      }
    });

    // 私聊列表刷新请求
    socket.on('refresh_dm_list', () => {
      const { fetchDMList } = get();
      fetchDMList();
    });

    // 私聊通知（更新未读数）
    socket.on('dm_notification', ({ conversationId, lastMessage, timestamp }) => {
      const { currentDM, dmList, fetchDMList, showDMPanel, globalUnreadCount } = get();
      
      // 检查是否是新会话
      const exists = dmList.some(conv => conv.id === conversationId);
      if (!exists) {
        fetchDMList();
        // 新会话通知
        playNotificationSound();
        if (document.hidden) {
            const newCount = globalUnreadCount + 1;
            set({ globalUnreadCount: newCount });
            updateTitleNotification(newCount);
        }
        return;
      }
      
      // Check if viewing
      const isViewing = currentDM && String(currentDM.id) === String(conversationId) && showDMPanel;
      
      if (!isViewing) {
          playNotificationSound();
          if (document.hidden) {
              const newCount = globalUnreadCount + 1;
              set({ globalUnreadCount: newCount });
              updateTitleNotification(newCount);
          }
      }
      
      set((state) => {
        // 准确判断是否是当前正在查看的会话
        // 必须: 1. currentDM 存在且 ID 匹配 2. DM 面板是打开的
        // 使用 String() 确保 ID 类型一致
        // const isViewing = ... (already calculated above, but we need it inside set for consistency with state updates if race conditions)
        // Let's use the one from state to be safe inside reducer
        const isViewingInner = state.currentDM && String(state.currentDM.id) === String(conversationId) && state.showDMPanel;
        
        if (isViewingInner) {
            // 如果正在查看，通知后端已读
            socket.emit('mark_dm_read', conversationId);
        }

        const newDmList = state.dmList.map(conv => {
          if (conv.id === conversationId) {
            return {
              ...conv,
              lastMessage,
              lastMessageAt: timestamp,
              unreadCount: isViewingInner ? 0 : (conv.unreadCount || 0) + 1
            };
          }
          return conv;
        });
        
        // 计算总未读数
        const dmUnreadTotal = newDmList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
        
        return { dmList: newDmList, dmUnreadTotal };
      });
    });

    // 私聊消息撤回事件
    socket.on('dm_message_recalled', ({ messageId, conversationId, recalledBy }) => {
      const { currentDM } = get();
      
      if (currentDM && currentDM.id === conversationId) {
        set((state) => ({
          dmMessages: state.dmMessages.map(msg =>
            msg.id === messageId ? { ...msg, recalled: true } : msg
          )
        }));
      }
    });

    // 私聊消息删除事件
    socket.on('dm_message_deleted', ({ messageId, conversationId }) => {
      const { currentDM } = get();
      
      if (currentDM && currentDM.id === conversationId) {
        set((state) => ({
          dmMessages: state.dmMessages.filter(msg => msg.id !== messageId)
        }));
      }
    });

    // 私聊会话删除事件
    socket.on('conversation_deleted', ({ conversationId }) => {
      const { currentDM, fetchDMList } = get();
      
      // 如果当前打开的是被删除的会话，关闭它
      if (currentDM && currentDM.id === conversationId) {
        set({ currentDM: null, dmMessages: [], showDMPanel: false });
      }
      
      // 刷新会话列表
      fetchDMList();
    });

    // Initial fetch
    socket.emit('get_rooms', (rooms) => {
        // Process cooldowns into timestamps
        const processedRooms = rooms.map(r => ({
            ...r,
            cooldownUntil: r.cooldown ? Date.now() + r.cooldown * 1000 : null
        }));
        set({ rooms: processedRooms });
    });
  },

  // ...

  // Helper to process rooms from server updates
  processRoomsUpdate: (rooms) => {
      return rooms.map(r => ({
          ...r,
          cooldownUntil: r.cooldown ? Date.now() + r.cooldown * 1000 : null
      }));
  },

  // ... 

  // Need to update all set({ rooms }) calls to use processing
  // Actually, easiest way is to intercept the socket listeners or just do it inline
  // Let's update the listeners


  login: (username, password, isAutoLogin = false) => {
    return new Promise((resolve) => {
      socket.emit('login', { username, password }, (response) => {
        if (response.success) {
          // Server returns user object with persistentId
          // Only show welcome modal if:
          // 1. It's a new user (isNewUser === true)
          // 2. They haven't seen it before (no localStorage mark)
          // 3. It's not an auto-login (user manually logging in)
          const hasSeenWelcome = localStorage.getItem(`welcome_seen_${response.user.id}`);
          const shouldShowWelcome = response.isNewUser && !hasSeenWelcome && !isAutoLogin;
          const isAdminUser = !!response.user.isAdmin;
          const shouldShowAdminWelcome = isAdminUser && !isAutoLogin;
          
          set({ 
            user: response.user, 
            connected: true,
            showWelcomeModal: shouldShowWelcome,
            showAdminWelcomeModal: shouldShowAdminWelcome
          });
          
          // Save session for auto-reconnect
          localStorage.setItem('chat_session', JSON.stringify({ 
              username, 
              password, 
              userId: response.user.id // Save the persistent ID returned by server
          }));
          
          // Return success with isNewUser flag
          resolve({ success: true, isNewUser: response.isNewUser });
        } else {
          resolve({ success: false, error: response.error });
        }
      });
    });
  },

  logout: () => {
    localStorage.removeItem('chat_session');
    localStorage.removeItem('last_room_id');
    set({ user: null, currentRoom: null, messages: [] });
    window.location.reload();
  },

  updateAvatar: (avatarId) => {
    return new Promise((resolve) => {
      socket.emit('update_avatar', avatarId, (response) => {
        if (response.success) {
          set((state) => ({
            user: { ...state.user, avatarId: response.avatarId }
          }));
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response.error });
        }
      });
    });
  },

  fetchAdminRooms: () => {
    const { user } = get();
    if (!user?.isAdmin) return;

    socket.emit('get_rooms', (rooms) => {
      set({ adminRooms: rooms || [] });
    });
  },

  createRoom: (name) => {
    return new Promise((resolve) => {
      socket.emit('create_room', name, ({ success, roomId }) => {
        if (success) resolve(roomId);
      });
    });
  },

  joinRoom: (roomId) => {
    return new Promise((resolve) => {
      const { currentRoom, messages, messageCache } = get();
      
      // 如果当前已经在该房间，只关闭DM面板
      if (currentRoom?.id === roomId) {
        set({ showDMPanel: false });
        resolve({ success: true });
        return;
      }

      // 关闭 DM 面板
      set({ showDMPanel: false });

      // Save current room messages to cache before switching
      if (currentRoom && messages.length > 0) {
        set((state) => ({
          messageCache: { ...state.messageCache, [currentRoom.id]: messages }
        }));
      }
      
      socket.emit('join_room', roomId, ({ success, room, history, banner, userAvatars: serverAvatars, error, cooldown, remainingSeconds, roomName }) => {
        if (success) {
          // Save last room for auto-rejoin
          localStorage.setItem('last_room_id', roomId);
          
          // 始终使用服务端返回的历史消息（最新的），不再依赖本地缓存
          // 因为用户不在房间时可能有新消息，缓存会过期
          
          // Reset unread count for this room
          const updatedRooms = get().rooms.map(r => 
            r.id === roomId ? { ...r, unreadCount: 0 } : r
          );
          
          const limitedMessages = (history || []).slice(-MAX_MESSAGES);

          // 合并服务端返回的用户头像映射
          const mergedAvatars = serverAvatars 
            ? { ...get().userAvatars, ...serverAvatars }
            : get().userAvatars;

          set({ 
            currentRoom: room, 
            messages: limitedMessages,
            roomBanner: banner || null,
            hasJoined: true,
            rooms: updatedRooms,
            userAvatars: mergedAvatars
          });
          resolve({ success: true });
        } else {
           // Check if it's a cooldown error
           if (cooldown) {
               set({ 
                   kickCooldownInfo: {
                       roomName: roomName,
                       cooldownUntil: Date.now() + (remainingSeconds * 1000)
                   }
               });
           } else {
               // Only show error if not cooldown (handled by modal)
               if (error) toast.error(error);
               
               // If room not found, clear storage
               if (error === 'Room not found') {
                   localStorage.removeItem('last_room_id');
               }
           }
           resolve({ success: false, error });
        }
      });
    });
  },

  closeCurrentRoom: () => {
      set({ currentRoom: null });
  },

  leaveRoom: () => {
    const { currentRoom, messages } = get();
    // Save messages before leaving
    if (currentRoom && messages.length > 0) {
      set((state) => ({
        messageCache: { ...state.messageCache, [currentRoom.id]: messages }
      }));
    }
    socket.emit('leave_room');
    localStorage.removeItem('last_room_id');
    set({ currentRoom: null, messages: [], replyingTo: null, roomBanner: null });
  },

  setReplyingTo: (message) => set({ replyingTo: message }),

  sendMessage: (text) => {
    const { currentRoom, replyingTo } = get();
    if (!currentRoom) return;
    
    // Prepare reply data if exists
    const replyData = replyingTo ? {
        id: replyingTo.id,
        text: replyingTo.text,
        sender: replyingTo.sender,
        imageUrl: replyingTo.imageUrl || null
    } : null;

    socket.emit('send_message', { 
        roomId: currentRoom.id, 
        message: text,
        replyTo: replyData 
    });
    
    // Clear reply state
    set({ replyingTo: null });
  },

  dismissRoom: (roomId, onSuccess) => {
      socket.emit('dismiss_room', roomId, ({ success, error }) => {
          if (success && typeof onSuccess === 'function') {
            onSuccess();
          }
          // 其他错误先不弹 UI，后续有需要可以在这里补充提示
      });
  },

  adminBroadcast: (message) => {
    return new Promise((resolve) => {
      const { currentRoom, user } = get();
      if (!currentRoom || !user?.isAdmin) {
        return resolve({ success: false, error: 'Not allowed' });
      }
      
      socket.emit('admin_broadcast', { roomId: currentRoom.id, message }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  clearRoomBanner: () => {
    return new Promise((resolve) => {
      const { currentRoom, user } = get();
      if (!currentRoom || !user?.isAdmin) {
        return resolve({ success: false, error: 'Not allowed' });
      }
      
      socket.emit('clear_room_banner', { roomId: currentRoom.id }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  // 撤回消息（房间）
  recallMessage: (messageId) => {
    return new Promise((resolve) => {
      const { currentRoom } = get();
      if (!currentRoom) {
        return resolve({ success: false, error: '未在房间中' });
      }
      
      socket.emit('recall_message', { messageId, roomId: currentRoom.id }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  // 删除消息（房间，管理员可删除任何消息，普通用户可删除自己的已撤回消息）
  deleteMessage: (messageId) => {
    return new Promise((resolve) => {
      const { currentRoom } = get();
      if (!currentRoom) {
        return resolve({ success: false, error: '未在房间中' });
      }
      
      socket.emit('delete_message', { messageId, roomId: currentRoom.id }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  // Admin User Management Actions
  fetchAdminUsers: () => {
    return new Promise((resolve) => {
        const { user } = get();
        if (!user?.isAdmin) return resolve([]);
        
        socket.emit('admin_get_all_users', (response) => {
            if (response.success) {
                resolve(response.users);
            } else {
                resolve([]);
            }
        });
    });
  },

  adminUpdateUser: (currentUsername, newUsername, newPassword) => {
    return new Promise((resolve) => {
        const { user } = get();
        if (!user?.isAdmin) return resolve({ success: false, error: 'Permission denied' });
        
        socket.emit('admin_update_user', { currentUsername, newUsername, newPassword }, (response) => {
            resolve(response);
        });
    });
  },
  
  fetchRoomUsers: (roomId) => {
      return new Promise((resolve) => {
        const { user } = get();
        if (!user?.isAdmin) return resolve([]);
        
        socket.emit('admin_get_room_users', roomId, (response) => {
            if (response.success) {
                resolve(response.users);
            } else {
                resolve([]);
            }
        });
      });
  },

  adminDeleteUser: (username) => {
    return new Promise((resolve) => {
        const { user } = get();
        if (!user?.isAdmin) return resolve({ success: false, error: 'Permission denied' });
        
        socket.emit('admin_delete_user', { username }, (response) => {
            resolve(response);
        });
    });
  },

  adminKickUser: (roomId, username) => {
    return new Promise((resolve) => {
        const { user } = get();
        if (!user?.isAdmin) return resolve({ success: false, error: 'Permission denied' });
        
        socket.emit('admin_kick_user', { roomId, username }, (response) => {
            resolve(response);
        });
    });
  },

  // ======= DM 私聊相关方法 =======
  
  // 搜索用户
  searchUsers: (query) => {
    return new Promise((resolve) => {
      socket.emit('search_users', query, (response) => {
        if (response.success) {
          resolve(response.users);
        } else {
          resolve([]);
        }
      });
    });
  },

  // 获取私聊列表
  fetchDMList: () => {
    return new Promise((resolve) => {
      socket.emit('get_dm_list', (response) => {
        if (response.success) {
          const dmUnreadTotal = response.conversations.reduce(
            (sum, conv) => sum + (conv.unreadCount || 0), 0
          );
          set({ dmList: response.conversations, dmUnreadTotal });
          resolve(response.conversations);
        } else {
          resolve([]);
        }
      });
    });
  },

  // 开始/进入私聊
  startDM: (targetUserId, targetUsername) => {
    return new Promise((resolve) => {
      // 退出当前房间（如果存在）
      if (get().currentRoom) {
        get().leaveRoom();
      }

      socket.emit('start_dm', { targetUserId, targetUsername }, (response) => {
        if (response.success) {
          set({
            currentDM: response.conversation,
            dmMessages: response.history || [],
            showDMPanel: true
          });
          
          // 更新列表中的未读数
          set((state) => {
            const newDmList = state.dmList.map(conv => 
              conv.id === response.conversation.id 
                ? { ...conv, unreadCount: 0 }
                : conv
            );
            const dmUnreadTotal = newDmList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
            return { dmList: newDmList, dmUnreadTotal };
          });
          
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response.error });
        }
      });
    });
  },

  // 进入已有的私聊会话
  enterDM: (conversation) => {
    return new Promise((resolve) => {
      // 退出当前房间（如果存在）
      if (get().currentRoom) {
        get().leaveRoom();
      }

      socket.emit('enter_dm', conversation.id, (response) => {
        if (response.success) {
          set({
            currentDM: conversation,
            dmMessages: response.history || [],
            showDMPanel: true
          });
          
          // 更新列表中的未读数
          set((state) => {
            const newDmList = state.dmList.map(conv => 
              conv.id === conversation.id 
                ? { ...conv, unreadCount: 0 }
                : conv
            );
            const dmUnreadTotal = newDmList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
            return { dmList: newDmList, dmUnreadTotal };
          });
          
          resolve({ success: true });
        } else {
          resolve({ success: false, error: response.error });
        }
      });
    });
  },

  // 发送私聊消息
  sendDMMessage: (text, imageUrl = null) => {
    const { currentDM, replyingTo } = get();
    if (!currentDM) return;
    
    const replyData = replyingTo ? {
      id: replyingTo.id,
      text: replyingTo.text,
      sender: replyingTo.sender,
      imageUrl: replyingTo.imageUrl || null
    } : null;

    socket.emit('send_dm', {
      conversationId: currentDM.id,
      message: text,
      imageUrl,
      replyTo: replyData
    });
    
    set({ replyingTo: null });
  },

  // 关闭私聊会话
  closeDM: () => {
    set({ currentDM: null, dmMessages: [], showDMPanel: false });
  },

  // 撤回私聊消息
  recallDMMessage: (messageId) => {
    return new Promise((resolve) => {
      const { currentDM } = get();
      if (!currentDM) {
        return resolve({ success: false, error: '未在会话中' });
      }
      
      socket.emit('recall_dm_message', { messageId, conversationId: currentDM.id }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  // 删除私聊消息（管理员可删除任何消息，普通用户可删除自己的已撤回消息）
  deleteDMMessage: (messageId) => {
    return new Promise((resolve) => {
      const { currentDM } = get();
      if (!currentDM) {
        return resolve({ success: false, error: '未在会话中' });
      }
      
      socket.emit('delete_dm_message', { messageId, conversationId: currentDM.id }, (response) => {
        resolve(response || { success: true });
      });
    });
  },

  // 删除整个私聊会话
  deleteConversation: (conversationId) => {
    return new Promise((resolve) => {
      socket.emit('delete_conversation', conversationId, (response) => {
        if (response?.success) {
          // 从列表中移除
          set((state) => ({
            dmList: state.dmList.filter(conv => conv.id !== conversationId)
          }));
        }
        resolve(response || { success: true });
      });
    });
  },

  // ======= 图片上传相关方法 =======
  
  // 上传图片
  uploadImage: async (file) => {
    set({ uploadingImage: true });
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        set({ uploadingImage: false });
        return { success: true, imageUrl: result.imageUrl };
      } else {
        set({ uploadingImage: false });
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Upload error:', err);
      set({ uploadingImage: false });
      return { success: false, error: '上传失败' };
    }
  },

  // 设置待发送的图片预览
  setPendingImage: (file) => {
    const preview = URL.createObjectURL(file);
    set({ pendingImage: { file, preview, url: null } });
  },

  // 发送图片消息（群聊）
  sendImageMessage: async (file) => {
    const { currentRoom } = get();
    if (!currentRoom) return { success: false };
    
    set({ uploadingImage: true });
    
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // 发送图片消息
        socket.emit('send_message', {
          roomId: currentRoom.id,
          message: '',
          imageUrl: result.imageUrl,
          replyTo: null
        });

        set({ uploadingImage: false, pendingImage: null });
        return { success: true };
      } else {
        set({ uploadingImage: false });
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.error('图片上传失败');
        }
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Upload error:', err);
      set({ uploadingImage: false });
      toast.error('图片上传失败');
      return { success: false, error: '上传失败' };
    }
  },

  // 发送图片私聊消息
  sendDMImageMessage: async (file) => {
    const { currentDM } = get();
    if (!currentDM) return { success: false };
    
    set({ uploadingImage: true });
    
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // 发送图片消息
        socket.emit('send_dm', {
          conversationId: currentDM.id,
          message: '',
          imageUrl: result.imageUrl,
          replyTo: null
        });

        set({ uploadingImage: false, pendingImage: null });
        return { success: true };
      } else {
        set({ uploadingImage: false });
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.error('图片上传失败');
        }
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Upload error:', err);
      set({ uploadingImage: false });
      toast.error('图片上传失败');
      return { success: false, error: '上传失败' };
    }
  }
}));
