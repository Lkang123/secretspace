import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// In-memory storage
const rooms = new Map(); // roomId -> { id, name, ownerId, createdAt }
const users = new Map(); // socket.id -> { id, username, isAdmin, currentRoom }
const messageHistory = new Map(); // roomId -> [messages] (limited to last 100)
const userCredentials = new Map(); // username -> { password, persistentId, isAdmin, joinedRooms: [] }

// Helper to get room list for a specific user
const getUserRooms = (userId) => {
  // Find credential entry by persistentId to get joinedRooms
  // In a real DB this would be easier. Here we have to search or keep a secondary map.
  // Let's iterate userCredentials for now (inefficient but fine for demo)
  let joinedRoomIds = [];
  for (const cred of userCredentials.values()) {
    if (cred.persistentId === userId) {
      joinedRoomIds = cred.joinedRooms || [];
      break;
    }
  }

  return Array.from(rooms.values())
    .filter(r => joinedRoomIds.includes(r.id))
    .map(r => ({
      id: r.id,
      name: r.name,
      userCount: io.sockets.adapter.rooms.get(r.id)?.size || 0,
      ownerId: r.ownerId // Include ownerId for user's own rooms to enable delete
    }));
};

// Helper to get all rooms (needed for legacy calls or admin)
const getRoomList = () => {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    userCount: io.sockets.adapter.rooms.get(r.id)?.size || 0
  }));
};

// Serve static files from client/dist
app.use(express.static(path.join(__dirname, 'client', 'dist')));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Initialize user
  users.set(socket.id, {
    id: socket.id,
    username: `User-${socket.id.substr(0, 4)}`,
    isAdmin: false,
    currentRoom: null
  });

  // --- Events ---

  // 1. Login / Register
  socket.on('login', ({ username, password }, callback) => {
    // Basic validation
    if (!username || !password) {
      return callback({ success: false, error: '用户名和密码不能为空' });
    }

    // Username validation: 2-16 characters, letters, numbers, underscore only
    const usernameRegex = /^[a-zA-Z0-9_]{2,16}$/;
    if (!usernameRegex.test(username)) {
      return callback({ 
        success: false, 
        error: '用户名需要2-16个字符，仅支持字母、数字、下划线' 
      });
    }

    // Password validation: 4-20 characters
    if (password.length < 4 || password.length > 20) {
      return callback({ 
        success: false, 
        error: '密码需要4-20个字符' 
      });
    }

    let persistentId;
    let isAdmin = false;
    let isNewUser = false;
    const existingUser = userCredentials.get(username);

    if (existingUser) {
      // Login: Check password
      if (existingUser.password !== password) {
        return callback({ success: false, error: '密码错误' });
      }
      persistentId = existingUser.persistentId;
      isAdmin = existingUser.isAdmin;
    } else {
      // Register: Create new user
      isNewUser = true;
      persistentId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Special hack: specific password grants admin
      isAdmin = password === 'admin123'; 
      
      userCredentials.set(username, {
        password,
        persistentId,
        isAdmin,
        joinedRooms: [],
        avatarId: null // Default: use username-based avatar
      });
    }

    // Get avatarId for response
    const userCred = userCredentials.get(username);
    const avatarId = userCred?.avatarId ?? null;

    // Store session for this socket
    users.set(socket.id, {
      id: socket.id,
      username,
      persistentId,
      isAdmin,
      avatarId,
      currentRoom: null
    });

    // Return success to client
    callback({ 
      success: true, 
      isNewUser,
      user: { 
        id: persistentId, 
        username, 
        isAdmin,
        avatarId
      } 
    });

    // Send user's joined rooms
    socket.emit('rooms_updated', getUserRooms(persistentId));
    console.log('User logged in');
  });

  // 1.5 Update Avatar
  socket.on('update_avatar', (avatarId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    // Update in credentials
    const cred = userCredentials.get(user.username);
    if (cred) {
      cred.avatarId = avatarId;
    }

    // Update in session
    user.avatarId = avatarId;
    users.set(socket.id, user);

    // Broadcast to all users that this user changed avatar
    io.emit('user_avatar_updated', {
      username: user.username,
      avatarId: avatarId
    });

    if (callback) callback({ success: true, avatarId });
    console.log(`User ${user.username} updated avatar to ${avatarId}`);
  });

  // 2. Create Room
  socket.on('create_room', (roomName, callback) => {
    const user = users.get(socket.id);
    const roomId = `room-${Date.now()}`;
    
    const newRoom = {
      id: roomId,
      name: roomName || `Room ${roomId}`,
      ownerId: user.persistentId, // Use persistent ID for ownership
      createdAt: new Date().toISOString()
    };

    rooms.set(roomId, newRoom);
    
    // Auto-add to user's joinedRooms
    const cred = userCredentials.get(user.username);
    if (cred) {
        if (!cred.joinedRooms) cred.joinedRooms = [];
        cred.joinedRooms.push(roomId);
    }

    // Broadcast only to user
    socket.emit('rooms_updated', getUserRooms(user.persistentId));

    if (callback) callback({ success: true, roomId });
    console.log('Room created');
  });

  // 3. Join Room
  socket.on('join_room', (roomId, callback) => {
    const user = users.get(socket.id);
    if (!rooms.has(roomId)) {
      return callback && callback({ success: false, error: 'Room not found' });
    }
    
    // Add to joinedRooms if not already
    const cred = userCredentials.get(user.username);
    if (cred) {
        if (!cred.joinedRooms) cred.joinedRooms = [];
        if (!cred.joinedRooms.includes(roomId)) {
            cred.joinedRooms.push(roomId);
        }
    }

    // Leave current room if any (Socket.io logic)
    if (user.currentRoom) {
      const oldRoomId = user.currentRoom;
      socket.leave(oldRoomId);
      
      // Notify others in the OLD room that user left
      socket.to(oldRoomId).emit('system_message', {
        text: `${user.username} left the room.`
      });

      // Update room counts for users remaining in the OLD room
      const socketsInOldRoom = io.sockets.adapter.rooms.get(oldRoomId);
      if (socketsInOldRoom) {
        socketsInOldRoom.forEach(socketId => {
          const roomUser = users.get(socketId);
          if (roomUser) {
            io.to(socketId).emit('rooms_updated', getUserRooms(roomUser.persistentId));
          }
        });
      }
    }

    socket.join(roomId);
    user.currentRoom = roomId;
    users.set(socket.id, user);

    // Get message history for this room
    const history = messageHistory.get(roomId) || [];

    // Notify others in the room (not the joining user)
    socket.to(roomId).emit('system_message', {
      text: `${user.username} joined the room.`
    });

    // Update room counts for all users in the room (including the joining user)
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      socketsInRoom.forEach(socketId => {
        const roomUser = users.get(socketId);
        if (roomUser) {
          io.to(socketId).emit('rooms_updated', getUserRooms(roomUser.persistentId));
        }
      });
    }
    
    const room = rooms.get(roomId);
    if (callback) callback({ 
      success: true, 
      room: {
        id: room.id,
        name: room.name,
        userCount: io.sockets.adapter.rooms.get(roomId)?.size || 0,
        ownerId: room.ownerId
      },
      history 
    });
  });

  // 3.5 Join Room By ID (New)
  socket.on('join_room_by_id', (roomId, callback) => {
      // Alias for join_room but logic is same
      // This event is just to handle "Search" UX if we want specific logic
      // For now, reuse join_room logic on client side calling 'join_room'
  });

  // 4. Leave Room
  socket.on('leave_room', () => {
    const user = users.get(socket.id);
    if (user.currentRoom) {
      const roomId = user.currentRoom;
      
      // Get sockets in room BEFORE leaving
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      
      socket.leave(roomId);
      socket.to(roomId).emit('system_message', {
        text: `${user.username} left the room.`
      });
      
      // Update room counts for remaining users
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          if (socketId !== socket.id) {
            const roomUser = users.get(socketId);
            if (roomUser) {
              io.to(socketId).emit('rooms_updated', getUserRooms(roomUser.persistentId));
            }
          }
        });
      }
      
      user.currentRoom = null;
      users.set(socket.id, user);
      
      // Update leaving user's room list too
      socket.emit('rooms_updated', getUserRooms(user.persistentId));
    }
  });

  // 5. Send Message
  socket.on('send_message', ({ message, roomId, replyTo }) => {
    const user = users.get(socket.id);
    // Verify user is actually in the room
    if (user.currentRoom !== roomId) return;

    const msgData = {
      id: Date.now(),
      text: message,
      sender: user.username,
      senderId: user.persistentId,
      senderAvatarId: user.avatarId ?? null, // Include avatar ID
      isAdmin: user.isAdmin,
      timestamp: new Date().toISOString(),
      replyTo: replyTo || null // Add replyTo field
    };

    // Store in history (limit to 100 messages per room)
    if (!messageHistory.has(roomId)) {
      messageHistory.set(roomId, []);
    }
    const history = messageHistory.get(roomId);
    history.push(msgData);
    if (history.length > 100) {
      history.shift(); // Remove oldest message
    }

    io.to(roomId).emit('receive_message', msgData);

    // Notify users who are members of this room but NOT currently inside
    for (const [socketId, socketUser] of users.entries()) {
        // Skip if user is in the room (they already got receive_message)
        if (socketUser.currentRoom === roomId) continue;

        // Check if user has joined this room
        const cred = userCredentials.get(socketUser.username);
        if (cred && cred.joinedRooms && cred.joinedRooms.includes(roomId)) {
            io.to(socketId).emit('room_notification', {
                roomId,
                lastMessage: message,
                timestamp: msgData.timestamp
            });
        }
    }
  });

  // 6. Dismiss Room (Admin or Owner only)
  socket.on('dismiss_room', (roomId, callback) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) return callback({ error: 'Room not found' });

    // Check against persistentId
    if (user.isAdmin || room.ownerId === user.persistentId) {
      // Notify all users in the room
      io.to(roomId).emit('room_dismissed', {
        text: `Room "${room.name}" has been dismissed by ${user.username}`
      });

      // Force all sockets to leave
      io.in(roomId).socketsLeave(roomId);
      
      rooms.delete(roomId);
      io.emit('rooms_updated', getRoomList());
      
      if (callback) callback({ success: true });
      console.log('Room dismissed');
    } else {
      if (callback) callback({ error: 'Permission denied' });
    }
  });

  // 7. Get Rooms
  socket.on('get_rooms', (callback) => {
    if (callback) callback(getRoomList());
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log('User disconnected');
      
      // If user was in a room, notify others and update counts
      if (user.currentRoom) {
        const roomId = user.currentRoom;
        
        // Notify others in the room
        socket.to(roomId).emit('system_message', {
          text: `${user.username} left the room.`
        });
        
        // Update room list for all users in this room
        // We need to broadcast to all sockets in the room
        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
          socketsInRoom.forEach(socketId => {
            const roomUser = users.get(socketId);
            if (roomUser) {
              io.to(socketId).emit('rooms_updated', getUserRooms(roomUser.persistentId));
            }
          });
        }
      }
      
      users.delete(socket.id);
    }
  });
});

// Handle SPA routing - return index.html for any unknown routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

const PORT = 3001; // Hardcoded to avoid .env conflicts
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('SecretSpace backend is ready.');
});
