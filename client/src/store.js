import { create } from 'zustand';
import { io } from 'socket.io-client';

const socket = io();
let isInitialized = false; // Prevent duplicate listeners from StrictMode

export const useChatStore = create((set, get) => ({
  socket,
  user: null,
  rooms: [],
  currentRoom: null,
  messages: [],
  messageCache: {}, // Cache messages per room: { roomId: [messages] }
  connected: false,
  showWelcomeModal: false,
  
  closeWelcomeModal: () => {
    const { user } = get();
    // Mark this user as having seen the welcome modal
    if (user) {
      localStorage.setItem(`welcome_seen_${user.id}`, 'true');
    }
    set({ showWelcomeModal: false });
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
            if (result.success) {
                // Auto-join last room
                const lastRoomId = localStorage.getItem('last_room_id');
                if (lastRoomId) {
                    get().joinRoom(lastRoomId);
                }
            }
        });
      }
    });

    socket.on('disconnect', () => set({ connected: false }));
    
    socket.on('rooms_updated', (rooms) => set({ rooms }));
    
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

    socket.on('room_dismissed', ({ roomId, roomName }) => {
        const { currentRoom, messageCache } = get();
        // Remove from cache and storage
        const newCache = { ...messageCache };
        if (currentRoom) {
          delete newCache[currentRoom.id];
        }
        localStorage.removeItem('last_room_id');
        set({ currentRoom: null, messages: [], messageCache: newCache });
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
          
          set({ 
            user: response.user, 
            connected: true,
            showWelcomeModal: shouldShowWelcome
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
      
      socket.emit('join_room', roomId, ({ success, room, history, error }) => {
        if (success) {
          // Save last room for auto-rejoin
          localStorage.setItem('last_room_id', roomId);
          
          // Use server history, or fallback to local cache
          const serverMessages = (history || []).map(msg => ({
            ...msg,
            id: `${msg.id}-${Math.random().toString(36).substr(2, 9)}`
          }));
          
          set({ currentRoom: room, messages: serverMessages });
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
    set({ currentRoom: null, messages: [] });
  },

  sendMessage: (text) => {
    const { currentRoom } = get();
    if (!currentRoom) return;
    socket.emit('send_message', { roomId: currentRoom.id, message: text });
  },

  dismissRoom: (roomId) => {
      socket.emit('dismiss_room', roomId, ({ success, error }) => {
          // Silent fail - error handling done on UI level
      });
  }
}));
