import { create } from 'zustand';
import { io } from 'socket.io-client';

const socket = io();
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

  // Actions
  initSocket: () => {
    // Prevent duplicate initialization (React StrictMode calls useEffect twice)
    if (isInitialized) return;
    isInitialized = true;

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
            }
        });
      } else {
        // No session to restore
        set({ isRestoring: false });
      }
    });

    socket.on('disconnect', () => set({ connected: false }));
    
    socket.on('rooms_updated', (newRooms) => {
      set((state) => {
        const existingRoomsMap = new Map(state.rooms.map(r => [r.id, r]));
        const mergedRooms = newRooms.map(newRoom => ({
          ...newRoom,
          unreadCount: existingRoomsMap.get(newRoom.id)?.unreadCount || 0
        }));
        return { rooms: mergedRooms };
      });
    });

    // Listen for room notifications (new messages when outside)
    socket.on('room_notification', ({ roomId }) => {
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
            return { rooms: newRooms };
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
    
    socket.on('receive_message', (message) => {
      const { currentRoom, messageCache, user } = get();
      // Determine if message is from self using persistent ID
      // We might need to update how we display messages in ChatArea too if we change senderId logic
      // For now, server sends senderId which is persistentId.
      // Frontend user object should also have persistentId.
      
      // Use a more unique key combining timestamp and random string
      const uniqueMessage = {
        ...message,
        id: `${message.id}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Update both current messages and cache
      set((state) => {
        const newMessages = [...state.messages, uniqueMessage];
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
        const newMessages = [...state.messages, sysMsg];
        const newCache = { ...state.messageCache };
        if (currentRoom) {
          newCache[currentRoom.id] = newMessages;
        }
        return { messages: newMessages, messageCache: newCache };
      });
    });

    socket.on('room_dismissed', ({ text, roomName }) => {
        const { currentRoom, messageCache } = get();
        // Remove from cache and storage
        const newCache = { ...messageCache };
        if (currentRoom) {
          delete newCache[currentRoom.id];
        }
        localStorage.removeItem('last_room_id');
        // Show dismissed notification to user
        set({ 
          currentRoom: null, 
          messages: [], 
          messageCache: newCache,
          roomDismissedInfo: { roomName: roomName || currentRoom?.name, message: text }
        });
    });

    // Initial fetch
    socket.emit('get_rooms', (rooms) => set({ rooms }));
  },

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
      
      // Save current room messages to cache before switching
      if (currentRoom && messages.length > 0) {
        set((state) => ({
          messageCache: { ...state.messageCache, [currentRoom.id]: messages }
        }));
      }
      
      socket.emit('join_room', roomId, ({ success, room, history, banner, error }) => {
        if (success) {
          // Save last room for auto-rejoin
          localStorage.setItem('last_room_id', roomId);
          
          // Clear unread count for this room
          set((state) => ({
              rooms: state.rooms.map(r => 
                  r.id === roomId ? { ...r, unreadCount: 0 } : r
              )
          }));

          // Use server history, or fallback to local cache
          const serverMessages = (history || []).map(msg => ({
            ...msg,
            id: `${msg.id}-${Math.random().toString(36).substr(2, 9)}`
          }));
          
          set({ currentRoom: room, messages: serverMessages, roomBanner: banner || null });
          resolve({ success: true });
        } else {
          // If join failed (e.g. room deleted), clear storage
          if (error === 'Room not found') {
              localStorage.removeItem('last_room_id');
          }
          resolve({ success: false, error });
        }
      });
    });
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
        sender: replyingTo.sender
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
  }
}));
