import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import sharp from 'sharp';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const IMAGE_RETENTION_DAYS = 15;

// 确保上传目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer 配置 - 图片上传
const storage = multer.memoryStorage(); // 使用内存存储，便于 sharp 处理
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'), false);
    }
  }
});

function cleanupOldImages() {
  fs.promises.readdir(UPLOADS_DIR)
    .then((files) => {
      const tasks = files.map(async (file) => {
        const match = file.match(/^img_(\d+)_/);
        if (!match) return;
        const timestamp = Number(match[1]);
        if (!Number.isFinite(timestamp)) return;
        const ageMs = Date.now() - timestamp;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays > IMAGE_RETENTION_DAYS) {
          const fullPath = path.join(UPLOADS_DIR, file);
          try {
            await fs.promises.unlink(fullPath);
            console.log(`Deleted old image: ${file}`);
          } catch (err) {
            console.error('Failed to delete image', file, err);
          }
        }
      });
      return Promise.all(tasks);
    })
    .catch((err) => {
      console.error('Failed to cleanup uploads directory', err);
    });
}

const app = express();
const httpServer = createServer(app);

// Socket.io 服务器配置 - 优化连接稳定性
const io = new Server(httpServer, {
  // 心跳检测配置
  pingTimeout: 30000,     // 30秒无响应视为断开
  pingInterval: 25000,    // 每25秒发送一次心跳
  
  // 连接配置
  connectTimeout: 45000,  // 连接超时45秒
  
  // 传输配置
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  
  // 允许的来源
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory storage
const rooms = new Map(); // roomId -> { id, name, ownerId, createdAt }
const users = new Map(); // socket.id -> { id, username, isAdmin, currentRoom } (Transient, do not save)
const messageHistory = new Map(); // roomId -> [messages] (limited to last 100)
const userCredentials = new Map(); // username -> { password, persistentId, isAdmin, joinedRooms: [] }
const roomBanners = new Map(); // roomId -> { message, createdAt, createdBy }
const kickedUsers = new Map(); // "roomId:username" -> kickedAt timestamp (5 min cooldown)
const dmConversations = new Map(); // conversationId -> { id, participants: [userId1, userId2], createdAt }

// --- Data Persistence Layer (SQLite) ---
class DataPersistence {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.db = new sqlite3.Database(DB_PATH);
    this.initTables();
  }

  initTables() {
    this.db.serialize(() => {
      // Key-Value store for configuration data
      this.db.run("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)");
      // We use a simple Key-Value store structure within SQLite for this architecture
      // to minimize refactoring while getting DB stability.
      // Keys: 'rooms', 'userCredentials', 'roomBanners', 'kickedUsers'
      
      // Messages table for persistent chat history
      this.db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        reply_to_id TEXT,
        reply_to_sender TEXT,
        reply_to_text TEXT,
        sender_avatar_id TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      // Create index for fast room-based queries
      this.db.run("CREATE INDEX IF NOT EXISTS idx_room_timestamp ON messages(room_id, timestamp DESC)");
      
      // DM conversations table
      this.db.run(`CREATE TABLE IF NOT EXISTS dm_conversations (
        id TEXT PRIMARY KEY,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        user1_name TEXT NOT NULL,
        user2_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      // DM messages table
      this.db.run(`CREATE TABLE IF NOT EXISTS dm_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message TEXT,
        image_url TEXT,
        timestamp TEXT NOT NULL,
        reply_to_id TEXT,
        reply_to_sender TEXT,
        reply_to_text TEXT,
        sender_avatar_id TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES dm_conversations(id)
      )`);
      
      // Create index for DM queries
      this.db.run("CREATE INDEX IF NOT EXISTS idx_dm_conversation ON dm_messages(conversation_id, timestamp DESC)");
      
      // Add image_url column to messages table if not exists (for room messages)
      this.db.run("ALTER TABLE messages ADD COLUMN image_url TEXT", (err) => {
        // Ignore error if column already exists
      });
      
      // Add recalled column for message recall feature
      this.db.run("ALTER TABLE messages ADD COLUMN recalled INTEGER DEFAULT 0", (err) => {
        // Ignore error if column already exists
      });
      
      // Add recalled column for DM messages
      this.db.run("ALTER TABLE dm_messages ADD COLUMN recalled INTEGER DEFAULT 0", (err) => {
        // Ignore error if column already exists
      });
      
      // Add reply_to_image_url column for storing image URL in replies
      this.db.run("ALTER TABLE messages ADD COLUMN reply_to_image_url TEXT", (err) => {
        // Ignore error if column already exists
      });
      
      this.db.run("ALTER TABLE dm_messages ADD COLUMN reply_to_image_url TEXT", (err) => {
        // Ignore error if column already exists
      });
    });
  }

  // Convert Map to JSON-serializable array
  mapToArray(map) {
    return Array.from(map.entries());
  }

  load() {
    console.log('Loading data from SQLite...');
    return new Promise((resolve, reject) => {
      this.db.all("SELECT key, value FROM kv_store", (err, rows) => {
        if (err) {
          console.error('Error loading data:', err);
          return resolve(); // Don't crash on load error
        }

        rows.forEach(row => {
          try {
            const data = JSON.parse(row.value);
            switch (row.key) {
              case 'rooms':
                data.forEach(([k, v]) => rooms.set(k, v));
                break;
              case 'userCredentials':
                data.forEach(([k, v]) => userCredentials.set(k, v));
                break;
              case 'messageHistory':
                // Legacy: messageHistory now stored in 'messages' table, skip loading from kv_store
                break;
              case 'roomBanners':
                data.forEach(([k, v]) => roomBanners.set(k, v));
                break;
              case 'kickedUsers':
                data.forEach(([k, v]) => kickedUsers.set(k, v));
                break;
            }
          } catch (e) {
            console.error(`Error parsing data for ${row.key}:`, e);
          }
        });
        console.log(`Data loaded: ${rooms.size} rooms, ${userCredentials.size} users.`);
        resolve();
      });
    });
  }

  save() {
    // Serialize Map data to JSON strings and save to SQLite
    // Using transaction for atomicity
    // Note: messageHistory is now stored in 'messages' table, not here
    const dataToSave = [
      { key: 'rooms', value: JSON.stringify(this.mapToArray(rooms)) },
      { key: 'userCredentials', value: JSON.stringify(this.mapToArray(userCredentials)) },
      { key: 'roomBanners', value: JSON.stringify(this.mapToArray(roomBanners)) },
      { key: 'kickedUsers', value: JSON.stringify(this.mapToArray(kickedUsers)) }
    ];

    this.db.serialize(() => {
      this.db.run("BEGIN TRANSACTION");
      const stmt = this.db.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)");
      dataToSave.forEach(item => {
        stmt.run(item.key, item.value);
      });
      stmt.finalize();
      this.db.run("COMMIT", (err) => {
        if (err) console.error('Error saving data to SQLite:', err);
      });
    });
  }

  // Save a single message to database
  saveMessage(msgData, roomId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO messages 
        (room_id, sender_id, sender_name, message, timestamp, reply_to_id, reply_to_sender, reply_to_text, sender_avatar_id, is_admin, image_url, reply_to_image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        roomId,
        msgData.senderId,
        msgData.sender,
        msgData.text || '',
        msgData.timestamp,
        msgData.replyTo?.id || null,
        msgData.replyTo?.sender || null,
        msgData.replyTo?.text || null,
        msgData.senderAvatarId || null,
        msgData.isAdmin ? 1 : 0,
        msgData.imageUrl || null,
        msgData.replyTo?.imageUrl || null,
        function(err) {
          if (err) {
            console.error('Error saving message:', err);
            reject(err);
          } else {
            // 返回数据库生成的 ID
            resolve(this.lastID);
          }
        }
      );
      
      stmt.finalize();
    });
  }

  // Get message history for a room (most recent first, then reversed)
  getMessageHistory(roomId, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM messages 
         WHERE room_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [roomId, limit],
        (err, rows) => {
          if (err) {
            console.error('Error fetching messages:', err);
            reject(err);
          } else {
            // Convert DB rows to message format and reverse to chronological order
            const messages = rows.reverse().map(row => ({
              id: row.id,
              text: row.message,
              sender: row.sender_name,
              senderId: row.sender_id,
              senderAvatarId: row.sender_avatar_id,
              isAdmin: row.is_admin === 1,
              timestamp: row.timestamp,
              imageUrl: row.image_url || null,
              recalled: row.recalled === 1,
              replyTo: row.reply_to_id ? {
                id: row.reply_to_id,
                sender: row.reply_to_sender,
                text: row.reply_to_text,
                imageUrl: row.reply_to_image_url || null
              } : null
            }));
            resolve(messages);
          }
        }
      );
    });
  }

  // ======= DM 相关数据库方法 =======
  
  // 创建或获取私聊会话
  getOrCreateDMConversation(user1Id, user2Id, user1Name, user2Name) {
    return new Promise((resolve, reject) => {
      // 先查找是否已存在会话
      this.db.get(
        `SELECT * FROM dm_conversations 
         WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
        [user1Id, user2Id, user2Id, user1Id],
        (err, row) => {
          if (err) return reject(err);
          
          if (row) {
            // 已存在会话
            resolve({
              id: row.id,
              participants: [
                { id: row.user1_id, name: row.user1_name },
                { id: row.user2_id, name: row.user2_name }
              ],
              createdAt: row.created_at,
              lastMessageAt: row.last_message_at
            });
          } else {
            // 创建新会话
            const convId = `dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this.db.run(
              `INSERT INTO dm_conversations (id, user1_id, user2_id, user1_name, user2_name) VALUES (?, ?, ?, ?, ?)`,
              [convId, user1Id, user2Id, user1Name, user2Name],
              (err) => {
                if (err) return reject(err);
                resolve({
                  id: convId,
                  participants: [
                    { id: user1Id, name: user1Name },
                    { id: user2Id, name: user2Name }
                  ],
                  createdAt: new Date().toISOString(),
                  lastMessageAt: new Date().toISOString()
                });
              }
            );
          }
        }
      );
    });
  }

  // 获取用户的所有私聊会话
  getUserDMConversations(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT c.*, 
          (SELECT COUNT(*) FROM dm_messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0) as unread_count,
          (SELECT message FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_message,
          (SELECT image_url FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_image
         FROM dm_conversations c
         WHERE c.user1_id = ? OR c.user2_id = ?
         ORDER BY c.last_message_at DESC`,
        [userId, userId, userId],
        (err, rows) => {
          if (err) return reject(err);
          
          const conversations = rows.map(row => {
            // 确定对方是谁
            const isUser1 = row.user1_id === userId;
            const otherUserId = isUser1 ? row.user2_id : row.user1_id;
            const otherUserName = isUser1 ? row.user2_name : row.user1_name;
            
            return {
              id: row.id,
              otherUser: { id: otherUserId, name: otherUserName },
              lastMessage: row.last_message || (row.last_image ? '[图片]' : ''),
              lastMessageAt: row.last_message_at,
              unreadCount: row.unread_count || 0
            };
          });
          
          resolve(conversations);
        }
      );
    });
  }

  // 保存私聊消息
  saveDMMessage(msgData, conversationId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO dm_messages 
        (conversation_id, sender_id, sender_name, message, image_url, timestamp, reply_to_id, reply_to_sender, reply_to_text, sender_avatar_id, reply_to_image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        conversationId,
        msgData.senderId,
        msgData.sender,
        msgData.text || '',
        msgData.imageUrl || null,
        msgData.timestamp,
        msgData.replyTo?.id || null,
        msgData.replyTo?.sender || null,
        msgData.replyTo?.text || null,
        msgData.senderAvatarId || null,
        msgData.replyTo?.imageUrl || null,
        function(err) {
          if (err) {
            console.error('Error saving DM message:', err);
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
      
      stmt.finalize();
      
      // 更新会话的最后消息时间
      this.db.run(
        `UPDATE dm_conversations SET last_message_at = ? WHERE id = ?`,
        [msgData.timestamp, conversationId]
      );
    });
  }

  // 获取私聊消息历史（限制条数）
  getDMHistory(conversationId, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM dm_messages 
         WHERE conversation_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [conversationId, limit],
        (err, rows) => {
          if (err) return reject(err);
          
          const messages = rows.reverse().map(row => ({
            id: row.id,
            text: row.message,
            imageUrl: row.image_url || null,
            sender: row.sender_name,
            senderId: row.sender_id,
            senderAvatarId: row.sender_avatar_id,
            timestamp: row.timestamp,
            isRead: row.is_read === 1,
            recalled: row.recalled === 1,
            replyTo: row.reply_to_id ? {
              id: row.reply_to_id,
              sender: row.reply_to_sender,
              text: row.reply_to_text,
              imageUrl: row.reply_to_image_url || null
            } : null
          }));
          
          resolve(messages);
        }
      );
    });
  }

  // 标记消息已读
  markDMMessagesAsRead(conversationId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE dm_messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?`,
        [conversationId, userId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  // 搜索用户（用于开始私聊）
  searchUsers(query, excludeUserId) {
    return new Promise((resolve) => {
      const results = [];
      for (const [username, cred] of userCredentials.entries()) {
        if (cred.persistentId !== excludeUserId && 
            username.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            id: cred.persistentId,
            username: cred.isAdmin ? '超级董事长' : username,
            realUsername: username,
            isAdmin: cred.isAdmin,
            avatarId: cred.avatarId
          });
        }
      }
      resolve(results.slice(0, 20)); // 最多返回20个结果
    });
  }

  // ======= 消息撤回/删除方法 =======
  
  // 撤回房间消息
  recallMessage(messageId, roomId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE messages SET recalled = 1 WHERE id = ? AND room_id = ?`,
        [messageId, roomId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }

  // 删除房间消息
  deleteMessage(messageId, roomId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM messages WHERE id = ? AND room_id = ?`,
        [messageId, roomId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }

  // 撤回私聊消息
  recallDMMessage(messageId, conversationId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE dm_messages SET recalled = 1 WHERE id = ? AND conversation_id = ?`,
        [messageId, conversationId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }

  // 删除私聊消息
  deleteDMMessage(messageId, conversationId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM dm_messages WHERE id = ? AND conversation_id = ?`,
        [messageId, conversationId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }

  // 删除整个私聊会话（包括所有消息）
  deleteConversation(conversationId, userId) {
    return new Promise((resolve, reject) => {
      // 首先验证用户是否是会话参与者
      this.db.get(
        `SELECT * FROM dm_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)`,
        [conversationId, userId, userId],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(false); // 不是参与者
          
          // 删除会话中的所有消息
          this.db.run(
            `DELETE FROM dm_messages WHERE conversation_id = ?`,
            [conversationId],
            (err) => {
              if (err) return reject(err);
              
              // 删除会话本身
              this.db.run(
                `DELETE FROM dm_conversations WHERE id = ?`,
                [conversationId],
                function(err) {
                  if (err) return reject(err);
                  resolve(this.changes > 0);
                }
              );
            }
          );
        }
      );
    });
  }

  // 获取单条消息（用于验证权限）
  getMessage(messageId, roomId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM messages WHERE id = ? AND room_id = ?`,
        [messageId, roomId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
  }

  // 获取单条私聊消息
  getDMMessage(messageId, conversationId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM dm_messages WHERE id = ? AND conversation_id = ?`,
        [messageId, conversationId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
  }
}

const persistence = new DataPersistence();

// Load data on startup
persistence.load();

// Auto-save every 10 seconds
setInterval(() => persistence.save(), 10000);

// Save on exit
process.on('SIGINT', () => {
  console.log('Stopping server, saving data...');
  persistence.save();
  process.exit();
});

// Helper to get visible user count (excluding stealth admins)
const getVisibleUserCount = (roomId) => {
  const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
  if (!socketsInRoom) return 0;
  
  let count = 0;
  socketsInRoom.forEach(socketId => {
    const roomUser = users.get(socketId);
    if (roomUser && !roomUser.isStealthInRoom) {
      count++;
    }
  });
  return count;
};

// Helper to get room list for a specific user
const getUserRooms = (userId) => {
  // Find credential entry by persistentId to get joinedRooms
  // In a real DB this would be easier. Here we have to search or keep a secondary map.
  // Let's iterate userCredentials for now (inefficient but fine for demo)
  let joinedRoomIds = [];
  let username = null;
  
  for (const [uName, cred] of userCredentials.entries()) {
    if (cred.persistentId === userId) {
      joinedRoomIds = cred.joinedRooms || [];
      username = uName;
      break;
    }
  }

  return Array.from(rooms.values())
    .filter(r => joinedRoomIds.includes(r.id))
    .map(r => {
      // Check cooldown
      let cooldownRemaining = 0;
      if (username) {
         const kickKey = `${r.id}:${username}`;
         const kickedAt = kickedUsers.get(kickKey);
         if (kickedAt) {
            const cooldownMs = 5 * 60 * 1000;
            const remaining = cooldownMs - (Date.now() - kickedAt);
            if (remaining > 0) {
               cooldownRemaining = Math.ceil(remaining / 1000); // Seconds
            } else {
               // Clean up expired cooldown
               kickedUsers.delete(kickKey);
            }
         }
      }

      return {
        id: r.id,
        name: r.name,
        userCount: getVisibleUserCount(r.id),
        ownerId: r.ownerId, // Include ownerId for user's own rooms to enable delete
        cooldown: cooldownRemaining
      };
    });
};

// Helper to get all rooms (needed for legacy calls or admin)
const getRoomList = () => {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    userCount: getVisibleUserCount(r.id)
  }));
};

// Helper to broadcast room update to admins
const broadcastAdminRoomUpdate = (roomId) => {
  // Note: admin panel usually wants total count, but consistent with getVisibleUserCount is safer
  // Actually admin panel should probably see ALL users including stealth admins?
  // For now let's stick to visible count to match other UI, or maybe total count.
  // Let's use getVisibleUserCount for consistency.
  const userCount = getVisibleUserCount(roomId);
  io.to('admin_channel').emit('admin_room_updated', {
    roomId,
    userCount
  });
};

// 检查用户是否在线（通过 persistentId）
const isUserOnline = (persistentId) => {
  for (const u of users.values()) {
    if (u.persistentId === persistentId) {
      return true;
    }
  }
  return false;
};

// 通知用户的私聊对象其在线状态变化
const notifyDMContactsOnlineStatus = async (userId, isOnline) => {
  try {
    // 获取该用户的所有私聊会话
    const conversations = await persistence.getUserDMConversations(userId);
    
    // 遍历每个会话，通知对方用户
    for (const conv of conversations) {
      const otherUserId = conv.otherUser.id;
      
      // 找到对方用户的所有在线 socket
      for (const [socketId, u] of users.entries()) {
        if (u.persistentId === otherUserId) {
          // 通知对方用户
          io.to(socketId).emit('dm_user_status', {
            userId: userId,
            isOnline
          });
        }
      }
    }
  } catch (err) {
    console.error('Error notifying DM contacts:', err);
  }
};

// Serve static files from client/dist
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// 图片上传 API
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 生成唯一文件名
    const filename = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // 使用 sharp 压缩并转换为 webp 格式（控制体积）
    await sharp(req.file.buffer)
      .resize(1600, 1600, { // 最大尺寸 1600x1600，保持比例
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 80 }) // webp 格式，质量 80%
      .toFile(filepath);

    // 返回可访问的 URL
    const imageUrl = `/uploads/${filename}`;
    res.json({ success: true, imageUrl });
    
    console.log(`Image uploaded: ${filename}`);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// 处理上传错误
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件太大，最大支持20MB' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === '只支持图片文件') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

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

  // Ping/Pong for connection health check
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback();
    }
  });

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
      // Only specific username + password combo grants admin
      isAdmin = (username === 'lsk45' && password === 'woshisuperman');
      
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

    // Display name: show "超级董事长" for admin instead of real username
    const displayName = isAdmin ? '超级董事长' : username;

    // Store session for this socket
    users.set(socket.id, {
      id: socket.id,
      username: displayName, // Use display name
      realUsername: username, // Keep real username for internal use
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
        username: displayName, // Show display name to client
        isAdmin,
        avatarId
      } 
    });

    // If user is admin, join admin updates channel
    if (isAdmin) {
      socket.join('admin_channel');
    }

    // Send user's joined rooms
    socket.emit('rooms_updated', getUserRooms(persistentId));
    console.log('User logged in');
    
    // 通知该用户的私聊对象：用户上线了
    notifyDMContactsOnlineStatus(persistentId, true);
  });

  // 1.5 Update Avatar
  socket.on('update_avatar', (avatarId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    // Update in credentials (use realUsername for admin)
    const credKey = user.realUsername || user.username;
    const cred = userCredentials.get(credKey);
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
  socket.on('join_room', async (roomId, callback) => {
    const user = users.get(socket.id);
    if (!rooms.has(roomId)) {
      return callback && callback({ success: false, error: 'Room not found' });
    }

    // Check kick cooldown (5 minutes) - admins bypass this
    if (!user.isAdmin) {
      const kickKey = `${roomId}:${user.realUsername || user.username}`;
      const kickedAt = kickedUsers.get(kickKey);
      if (kickedAt) {
        const cooldownMinutes = 5;
        const cooldownMs = cooldownMinutes * 60 * 1000;
        const timeRemaining = cooldownMs - (Date.now() - kickedAt);
        
        if (timeRemaining > 0) {
          const minutesLeft = Math.ceil(timeRemaining / 60000);
          return callback && callback({ 
            success: false, 
            error: `您已被移出该房间，请 ${minutesLeft} 分钟后再试` 
          });
        } else {
          // Cooldown expired, remove from kicked list
          kickedUsers.delete(kickKey);
        }
      }
    }
    
    const room = rooms.get(roomId);
    // Check if admin is entering someone else's room (stealth mode)
    const isAdminStealth = user.isAdmin && room.ownerId !== user.persistentId;
    
    // Add to joinedRooms if not already (use realUsername for admin)
    const credKey = user.realUsername || user.username;
    const cred = userCredentials.get(credKey);
    if (cred) {
        if (!cred.joinedRooms) cred.joinedRooms = [];
        if (!cred.joinedRooms.includes(roomId)) {
            cred.joinedRooms.push(roomId);
        }
    }

    // Leave current room if any (Socket.io logic)
    if (user.currentRoom) {
      const oldRoomId = user.currentRoom;
      const oldRoom = rooms.get(oldRoomId);
      const wasAdminStealth = user.isAdmin && oldRoom && oldRoom.ownerId !== user.persistentId;
      
      socket.leave(oldRoomId);
      
      // Only notify if not admin stealth mode
      if (!wasAdminStealth) {
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
      
      // Notify admins about old room update
      broadcastAdminRoomUpdate(oldRoomId);
    }

    socket.join(roomId);
    user.currentRoom = roomId;
    // Mark if admin is in stealth mode for this room
    user.isStealthInRoom = isAdminStealth;
    users.set(socket.id, user);

    // Get message history from database (last 100 messages)
    let history = [];
    try {
      history = await persistence.getMessageHistory(roomId, 100);
    } catch (err) {
      console.error('Failed to load message history:', err);
      // Fallback to memory cache if DB fails
      history = messageHistory.get(roomId) || [];
    }

    // Only notify and update counts if not admin stealth mode
    if (!isAdminStealth) {
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
    }
    
    // Calculate user count excluding stealth admins
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    let visibleUserCount = 0;
    if (socketsInRoom) {
      socketsInRoom.forEach(socketId => {
        const roomUser = users.get(socketId);
        if (roomUser && !roomUser.isStealthInRoom) {
          visibleUserCount++;
        }
      });
    }
    
    // Get room banner if exists
    const banner = roomBanners.get(roomId) || null;
    
    // 获取历史消息中涉及的用户的最新头像
    const userAvatars = {};
    const senderNames = new Set(history.map(msg => msg.sender));
    for (const senderName of senderNames) {
      // 查找用户凭证获取最新头像
      for (const [credUsername, cred] of userCredentials.entries()) {
        const displayName = cred.isAdmin ? '超级董事长' : credUsername;
        if (displayName === senderName && cred.avatarId !== undefined) {
          userAvatars[senderName] = cred.avatarId;
          break;
        }
      }
    }
    
    // Notify admins about new room update
    broadcastAdminRoomUpdate(roomId);

    if (callback) callback({ 
      success: true, 
      room: {
        id: room.id,
        name: room.name,
        userCount: visibleUserCount,
        ownerId: room.ownerId
      },
      history,
      banner,
      userAvatars  // 返回用户头像映射
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
      const wasStealthMode = user.isStealthInRoom;
      
      // Get sockets in room BEFORE leaving
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      
      socket.leave(roomId);
      
      // Only notify and update counts if not in stealth mode
      if (!wasStealthMode) {
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
      }
      
      user.currentRoom = null;
      user.isStealthInRoom = false;
      users.set(socket.id, user);
      
      // Update leaving user's room list too
      socket.emit('rooms_updated', getUserRooms(user.persistentId));
    }
  });

  // 5. Send Message (支持文本和图片)
  socket.on('send_message', async ({ message, roomId, replyTo, imageUrl }) => {
    const user = users.get(socket.id);
    // Verify user is actually in the room
    if (user.currentRoom !== roomId) return;

    const msgData = {
      text: message || '',
      imageUrl: imageUrl || null, // 图片URL
      sender: user.username,
      senderId: user.persistentId,
      senderAvatarId: user.avatarId ?? null, // Include avatar ID
      isAdmin: user.isAdmin,
      timestamp: new Date().toISOString(),
      replyTo: replyTo || null // Add replyTo field
    };

    // Save message to database (persistent storage) and get the real ID
    try {
      const dbId = await persistence.saveMessage(msgData, roomId);
      msgData.id = dbId; // 使用数据库生成的 ID
    } catch (err) {
      console.error('Failed to save message to database:', err);
      msgData.id = Date.now(); // 回退使用时间戳
    }

    // Also keep in memory cache for quick access (last 100 messages)
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

        // Check if user has joined this room (use realUsername for admin)
        const credKey = socketUser.realUsername || socketUser.username;
        const cred = userCredentials.get(credKey);
        if (cred && cred.joinedRooms && cred.joinedRooms.includes(roomId)) {
            io.to(socketId).emit('room_notification', {
                roomId,
                lastMessage: message || (imageUrl ? '[图片]' : ''),
                timestamp: msgData.timestamp
            });
        }
    }
  });

  // 5.5 Admin Broadcast (Admin only) - Set persistent banner notification for room
  socket.on('admin_broadcast', ({ roomId, message }, callback) => {
    const user = users.get(socket.id);
    
    // Only admin can broadcast
    if (!user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }
    
    // Verify room exists
    if (!rooms.has(roomId)) {
      return callback && callback({ success: false, error: 'Room not found' });
    }
    
    // Store banner persistently
    const banner = {
      message,
      createdAt: new Date().toISOString(),
      createdBy: user.username
    };
    roomBanners.set(roomId, banner);
    
    // Broadcast banner update to all users in the room
    io.to(roomId).emit('room_banner_updated', banner);
    
    // Also send as system message for chat history
    io.to(roomId).emit('system_message', {
      text: `📢 超级董事长发布了新通知：${message}`,
      isAdminBroadcast: true
    });
    
    if (callback) callback({ success: true, banner });
    console.log(`Admin set banner for room ${roomId}: ${message}`);
  });

  // 5.6 撤回消息 (2分钟内可撤回自己的消息)
  socket.on('recall_message', async ({ messageId, roomId }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    try {
      // 获取消息验证权限
      const msg = await persistence.getMessage(messageId, roomId);
      if (!msg) {
        return callback && callback({ success: false, error: '消息不存在' });
      }

      // 检查是否是自己的消息或管理员
      if (msg.sender_id !== user.persistentId && !user.isAdmin) {
        return callback && callback({ success: false, error: '只能撤回自己的消息' });
      }

      // 检查时间限制（2分钟内，管理员无限制）
      const msgTime = new Date(msg.timestamp).getTime();
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;
      if (!user.isAdmin && (now - msgTime) > twoMinutes) {
        return callback && callback({ success: false, error: '超过2分钟无法撤回' });
      }

      // 执行撤回
      await persistence.recallMessage(messageId, roomId);

      // 更新内存缓存
      const history = messageHistory.get(roomId);
      if (history) {
        const msgIndex = history.findIndex(m => m.id === messageId);
        if (msgIndex >= 0) {
          history[msgIndex].recalled = true;
        }
      }

      // 广播给房间内所有人
      io.to(roomId).emit('message_recalled', { messageId, roomId, recalledBy: user.username });

      if (callback) callback({ success: true });
      console.log(`Message ${messageId} recalled by ${user.username} in room ${roomId}`);
    } catch (err) {
      console.error('Recall message error:', err);
      if (callback) callback({ success: false, error: '撤回失败' });
    }
  });

  // 5.7 删除消息 (管理员可删除任何消息，普通用户可删除自己的已撤回消息)
  socket.on('delete_message', async ({ messageId, roomId }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    try {
      // 获取消息验证权限
      const msg = await persistence.getMessage(messageId, roomId);
      if (!msg) {
        return callback && callback({ success: false, error: '消息不存在' });
      }

      // 权限检查：管理员可删除任何消息，普通用户只能删除自己的已撤回消息
      const isOwner = msg.sender_id === user.persistentId;
      const isRecalled = msg.recalled === 1;
      if (!user.isAdmin && !(isOwner && isRecalled)) {
        return callback && callback({ success: false, error: '只能删除自己已撤回的消息' });
      }

      // 执行删除
      const deleted = await persistence.deleteMessage(messageId, roomId);
      if (!deleted) {
        return callback && callback({ success: false, error: '删除失败' });
      }

      // 更新内存缓存
      const history = messageHistory.get(roomId);
      if (history) {
        const msgIndex = history.findIndex(m => m.id === messageId);
        if (msgIndex >= 0) {
          history.splice(msgIndex, 1);
        }
      }

      // 广播给房间内所有人
      io.to(roomId).emit('message_deleted', { messageId, roomId });

      if (callback) callback({ success: true });
      console.log(`Message ${messageId} deleted by ${user.username} in room ${roomId}`);
    } catch (err) {
      console.error('Delete message error:', err);
      if (callback) callback({ success: false, error: '删除失败' });
    }
  });

  // 5.6 Clear Room Banner (Admin only)
  socket.on('clear_room_banner', ({ roomId }, callback) => {
    const user = users.get(socket.id);
    
    if (!user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }
    
    if (!rooms.has(roomId)) {
      return callback && callback({ success: false, error: 'Room not found' });
    }
    
    // Remove banner
    roomBanners.delete(roomId);
    
    // Notify all users in the room
    io.to(roomId).emit('room_banner_updated', null);
    
    if (callback) callback({ success: true });
    console.log(`Admin cleared banner for room ${roomId}`);
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
        text: `房间「${room.name}」已被 ${user.username} 解散`,
        roomName: room.name,
        roomId: roomId, // Add roomId for accurate removal
        dismissedBy: user.username
      });

      // Specially notify the room owner if they are online but NOT in the room
      // (e.g. they are in lobby or another room)
      if (room.ownerId) {
        for (const [socketId, u] of users.entries()) {
          if (u.persistentId === room.ownerId && u.currentRoom !== roomId) {
            io.to(socketId).emit('room_dismissed', {
              text: `您的房间「${room.name}」已被 ${user.username} 解散`,
              roomName: room.name,
              roomId: roomId,
              dismissedBy: user.username
            });
          }
        }
      }

      // Force all sockets to leave
      io.in(roomId).socketsLeave(roomId);
      
      rooms.delete(roomId);
      
      // Broadcast to everyone to update list (since room is gone)
      io.emit('rooms_updated', getRoomList()); // This sends full list to everyone, but we usually send user-specific lists. 
      // Wait, 'rooms_updated' client-side expects user-specific list? 
      // Client listener: socket.on('rooms_updated', (rooms) => set({ rooms }));
      // getRoomList() returns ALL rooms. 
      // The standard flow (see create_room) emits getUserRooms(userId).
      
      // Correct approach: Notify everyone to refresh their room list
      // Since we don't want to iterate all users, we can just let the client handle 'room_dismissed' which triggers 'get_rooms'.
      // BUT for users NOT in the room who can see it, they need an update.
      // For now, let's iterate all users and send them updated lists? That's expensive.
      // Or better: Admin panel uses getRoomList via 'get_rooms' polling or 'admin_room_updated'.
      // Normal users only see joined rooms. If they joined this room, they should be notified.
      
      // We should iterate users who joined this room and update their list.
      // But simplest is: iterate all online users, check if they joined this room, update them.
      
      for (const [socketId, u] of users.entries()) {
        const credKey = u.realUsername || u.username;
        const cred = userCredentials.get(credKey);
        if (cred && cred.joinedRooms && cred.joinedRooms.includes(roomId)) {
           // Remove from joinedRooms
           cred.joinedRooms = cred.joinedRooms.filter(id => id !== roomId);
           // Send update
           io.to(socketId).emit('rooms_updated', getUserRooms(u.persistentId));
        }
      }
      
      // Also notify admins about list update
      // Admin panel might be open
      // Broadcast to admin channel
      // Since room is deleted, we can't send userCount.
      // But we should probably trigger a list refresh for admins.
      // Since we don't have 'admin_rooms_refresh' event, and admin panel polls or uses get_rooms.
      // Admin panel uses fetchAdminRooms which emits 'get_rooms'.
      // Let's emit a system message or similar to trigger refresh?
      // Actually, users in the room will leave, triggering 'leave_room' logic which updates counts?
      // But room is deleted immediately.
      
      // Let's just assume admin panel will refresh when they do something, or we can add a "refresh" event later.
      // For now the owner notification is the key request.
      
      if (callback) callback({ success: true });
      console.log('Room dismissed');
    } else {
      if (callback) callback({ error: 'Permission denied' });
    }
  });

  // 7. Get Rooms - returns user-specific rooms, or all rooms for admin
  socket.on('get_rooms', (callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback([]);
    }
    // Admin gets all rooms (for admin panel), normal users get only their joined rooms
    if (user.isAdmin) {
      if (callback) callback(getRoomList());
    } else {
      if (callback) callback(getUserRooms(user.persistentId));
    }
  });

  // 7. Admin: Get All Users
  socket.on('admin_get_all_users', (callback) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }

    const allUsers = [];
    for (const [username, cred] of userCredentials.entries()) {
      // Check online status
      let isOnline = false;
      let currentRoomName = null;
      
      for (const u of users.values()) {
        if (u.persistentId === cred.persistentId) {
            isOnline = true;
            if (u.currentRoom) {
                const r = rooms.get(u.currentRoom);
                currentRoomName = r ? r.name : null;
            }
            break;
        }
      }

      allUsers.push({
        username,
        password: cred.password, // Admin can see passwords
        isAdmin: cred.isAdmin,
        persistentId: cred.persistentId,
        isOnline,
        currentRoomName
      });
    }

    callback({ success: true, users: allUsers });
  });

  // 8. Admin: Update User (Username/Password)
  socket.on('admin_update_user', ({ currentUsername, newUsername, newPassword }, callback) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }

    const cred = userCredentials.get(currentUsername);
    if (!cred) {
      return callback({ success: false, error: 'User not found' });
    }

    // If username is changing, check if new one exists
    if (newUsername !== currentUsername) {
        if (userCredentials.has(newUsername)) {
            return callback({ success: false, error: 'Username already taken' });
        }
        
        // Remove old entry and add new one
        userCredentials.delete(currentUsername);
        userCredentials.set(newUsername, {
            ...cred,
            password: newPassword
        });
        
        // Update any active sessions for this user
        for (const [sid, u] of users.entries()) {
            if (u.realUsername === currentUsername) {
                u.realUsername = newUsername;
                u.username = cred.isAdmin ? '超级董事长' : newUsername; // Update display name if not admin
                users.set(sid, u);
                
                // Notify user? Or just let them be
            }
        }
    } else {
        // Just update password
        cred.password = newPassword;
    }

    callback({ success: true });
  });

  // 9. Admin: Get Room Users
  socket.on('admin_get_room_users', (roomId, callback) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }
    
    const room = rooms.get(roomId);
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    const roomUsers = [];
    
    if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
            const u = users.get(socketId);
            if (u) {
                roomUsers.push({
                    username: u.username, // Display name
                    realUsername: u.realUsername,
                    isAdmin: u.isAdmin,
                    isStealth: u.isStealthInRoom || false,
                    isOwner: room && room.ownerId === u.persistentId
                });
            }
        });
    }
    
    callback({ success: true, users: roomUsers });
  });

  // 10. Admin: Kick User from Room
  socket.on('admin_kick_user', ({ roomId, username }, callback) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }

    // Find the target user's socket
    let targetSocketId = null;
    for (const [sid, u] of users.entries()) {
      if (u.realUsername === username && u.currentRoom === roomId) {
        targetSocketId = sid;
        break;
      }
    }

    if (!targetSocketId) {
      return callback({ success: false, error: 'User not in this room' });
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      const targetUser = users.get(targetSocketId);
      const isOwner = room.ownerId === targetUser.persistentId;
      
      // Check how many users are in the room
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      const roomSize = socketsInRoom ? socketsInRoom.size : 0;
      const isOnlyUser = roomSize === 1;

      // If this is the only user in the room, dismiss the room instead
      if (isOnlyUser) {
        // Dismiss room
        rooms.delete(roomId);
        messageHistory.delete(roomId);
        roomBanners.delete(roomId);
        
        // Notify the user about room dismissal (not kick)
        targetSocket.emit('room_dismissed', { 
          text: '房间已被管理员解散',
          roomName: room.name,
          roomId: roomId
        });
        
        // Force leave the room
        targetSocket.leave(roomId);
        if (targetUser) {
          targetUser.currentRoom = null;
        }
        
        console.log(`Room ${roomId} dismissed (only user kicked by admin)`);
      } else {
        // Multiple users in room, proceed with kick
        
        // Record kick time (5 min cooldown)
        const kickKey = `${roomId}:${username}`;
        kickedUsers.set(kickKey, Date.now());
        
        // If kicking the room owner, transfer ownership
        if (isOwner) {
          let newOwner = null;
          
          // Find other users in the room (excluding the kicked owner)
          for (const socketId of socketsInRoom) {
            if (socketId !== targetSocketId) {
              const candidate = users.get(socketId);
              if (candidate && !candidate.isAdmin) {
                newOwner = candidate;
                break;
              }
            }
          }
          
          // If no regular user found, use an admin if available
          if (!newOwner) {
            for (const socketId of socketsInRoom) {
              if (socketId !== targetSocketId) {
                const candidate = users.get(socketId);
                if (candidate) {
                  newOwner = candidate;
                  break;
                }
              }
            }
          }

          if (newOwner) {
            // Transfer ownership
            room.ownerId = newOwner.persistentId;
            console.log(`Room ownership transferred to ${newOwner.username}`);
            
            // Notify room about ownership transfer
            io.to(roomId).emit('system_message', {
              id: `sys-${Date.now()}`,
              type: 'system',
              text: `房主已被移出，${newOwner.username} 成为新房主`,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Notify the user they're being kicked (with cooldown)
        targetSocket.emit('kicked_from_room', { 
          roomName: room.name,
          reason: isOwner 
            ? '您已被管理员移出房间并失去房主身份，5分钟内无法重新加入' 
            : '您已被管理员移出房间，5分钟内无法重新加入'
        });
        
        // Force leave the room
        targetSocket.leave(roomId);
        if (targetUser) {
          targetUser.currentRoom = null;
        }

        // Notify others in the room
        const systemMsg = {
          id: `sys-${Date.now()}`,
          type: 'system',
          text: `${username} 被管理员移出房间`,
          timestamp: new Date().toISOString()
        };
        io.to(roomId).emit('system_message', systemMsg);

        // Update room user count
        const updatedSockets = io.sockets.adapter.rooms.get(roomId);
        const userCount = updatedSockets ? updatedSockets.size : 0;
        io.to(roomId).emit('room_user_count', { roomId, userCount });
        
        // Update room list for remaining users in the room (so their left sidebar updates)
        if (updatedSockets) {
          updatedSockets.forEach(socketId => {
            const roomUser = users.get(socketId);
            if (roomUser) {
              io.to(socketId).emit('rooms_updated', getUserRooms(roomUser.persistentId));
            }
          });
        }
        
        // Also update the kicked user's list (so they see correct count)
        if (targetUser) {
          io.to(targetSocketId).emit('rooms_updated', getUserRooms(targetUser.persistentId));
        }

        // Also notify admins
        broadcastAdminRoomUpdate(roomId);
      }
    }

    callback({ success: true });
    console.log(`Admin kicked ${username} from room ${roomId} (5 min cooldown)`);
  });

  // 11. Admin: Delete User
  socket.on('admin_delete_user', ({ username }, callback) => {
    const user = users.get(socket.id);
    if (!user || !user.isAdmin) {
      return callback && callback({ success: false, error: 'Permission denied' });
    }

    const targetCred = userCredentials.get(username);
    if (!targetCred) {
      return callback({ success: false, error: 'User not found' });
    }

    // Prevent deleting admin users
    if (targetCred.isAdmin) {
      return callback({ success: false, error: 'Cannot delete admin users' });
    }

    // Find and disconnect all sessions of this user
    const targetPersistentId = targetCred.persistentId;
    const socketsToDisconnect = [];
    
    for (const [socketId, u] of users.entries()) {
      if (u.persistentId === targetPersistentId) {
        socketsToDisconnect.push(socketId);
      }
    }

    // Disconnect all sessions
    socketsToDisconnect.forEach(socketId => {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        console.log(`Sending force_logout to socket ${socketId}`);
        targetSocket.emit('force_logout', { reason: '您的账号已被管理员删除' });
        // Delay disconnect to ensure event is received
        setTimeout(() => {
          console.log(`Disconnecting socket ${socketId}`);
          targetSocket.disconnect(true);
        }, 500);
      }
    });

    // Delete user credentials
    userCredentials.delete(username);

    callback({ success: true });
    console.log(`Admin deleted user: ${username}`);
  });

  // ======= 私聊 DM 相关事件 =======
  
  // 12. 搜索用户（用于开始私聊）
  socket.on('search_users', async (query, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      const results = await persistence.searchUsers(query, user.persistentId);
      callback({ success: true, users: results });
    } catch (err) {
      console.error('Search users error:', err);
      callback({ success: false, error: 'Search failed' });
    }
  });

  // 13. 开始/获取私聊会话
  socket.on('start_dm', async ({ targetUserId, targetUsername }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      const conversation = await persistence.getOrCreateDMConversation(
        user.persistentId,
        targetUserId,
        user.username,
        targetUsername
      );
      
      // 加入私聊房间（用于实时消息推送）
      socket.join(`dm:${conversation.id}`);
      
      // 查找 targetUserId 对应的在线 socket，让他也加入房间，并通知刷新列表
      for (const [sid, u] of users.entries()) {
        if (u.persistentId === targetUserId) {
          const targetSocket = io.sockets.sockets.get(sid);
          if (targetSocket) {
            targetSocket.join(`dm:${conversation.id}`);
            targetSocket.emit('refresh_dm_list');
          }
        }
      }
      
      // 获取消息历史
      const history = await persistence.getDMHistory(conversation.id);
      
      // 标记消息已读
      await persistence.markDMMessagesAsRead(conversation.id, user.persistentId);
      
      callback({ 
        success: true, 
        conversation: {
          ...conversation,
          otherUser: { id: targetUserId, name: targetUsername }
        },
        history 
      });
    } catch (err) {
      console.error('Start DM error:', err);
      callback({ success: false, error: 'Failed to start DM' });
    }
  });

  // 14. 获取私聊列表
  socket.on('get_dm_list', async (callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      const conversations = await persistence.getUserDMConversations(user.persistentId);
      
      // 为每个会话加入房间（用于接收实时消息）
      conversations.forEach(conv => {
        socket.join(`dm:${conv.id}`);
      });
      
      callback({ success: true, conversations });
    } catch (err) {
      console.error('Get DM list error:', err);
      callback({ success: false, error: 'Failed to get DM list' });
    }
  });

  // 15. 发送私聊消息
  socket.on('send_dm', async ({ conversationId, message, imageUrl, replyTo }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      const msgData = {
        text: message || '',
        imageUrl: imageUrl || null,
        sender: user.username,
        senderId: user.persistentId,
        senderAvatarId: user.avatarId ?? null,
        timestamp: new Date().toISOString(),
        replyTo: replyTo || null
      };
      
      // 保存到数据库
      const msgId = await persistence.saveDMMessage(msgData, conversationId);
      
      // 广播给会话中的所有参与者
      const fullMsg = { ...msgData, id: msgId };
      io.to(`dm:${conversationId}`).emit('receive_dm', {
        conversationId,
        message: fullMsg
      });
      
      // 通知对方有新消息（如果不在此会话中）
      // 这里简化处理，让前端通过 dm_notification 更新未读数
      io.to(`dm:${conversationId}`).emit('dm_notification', {
        conversationId,
        lastMessage: message || '[图片]',
        timestamp: msgData.timestamp
      });
      
      if (callback) callback({ success: true, message: fullMsg });
    } catch (err) {
      console.error('Send DM error:', err);
      if (callback) callback({ success: false, error: 'Failed to send message' });
    }
  });

  // 15.5 查询用户在线状态
  socket.on('check_user_online', (userId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    const online = isUserOnline(userId);
    if (callback) callback({ success: true, isOnline: online });
  });

  // 16. 进入私聊会话（加入房间 + 标记已读）
  socket.on('enter_dm', async (conversationId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      socket.join(`dm:${conversationId}`);
      await persistence.markDMMessagesAsRead(conversationId, user.persistentId);
      
      // 通知对方消息已被阅读
      socket.to(`dm:${conversationId}`).emit('dm_messages_read', {
        conversationId,
        readBy: user.persistentId,
        readByName: user.username
      });
      
      const history = await persistence.getDMHistory(conversationId);
      callback({ success: true, history });
    } catch (err) {
      console.error('Enter DM error:', err);
      callback({ success: false, error: 'Failed to enter DM' });
    }
  });

  // 17. 标记私聊已读
  socket.on('mark_dm_read', async (conversationId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }
    
    try {
      await persistence.markDMMessagesAsRead(conversationId, user.persistentId);
      
      // 通知对方消息已被阅读
      socket.to(`dm:${conversationId}`).emit('dm_messages_read', {
        conversationId,
        readBy: user.persistentId,
        readByName: user.username
      });
      
      if (callback) callback({ success: true });
    } catch (err) {
      console.error('Mark DM read error:', err);
      if (callback) callback({ success: false, error: 'Failed to mark as read' });
    }
  });

  // 18. 撤回私聊消息 (2分钟内可撤回自己的消息)
  socket.on('recall_dm_message', async ({ messageId, conversationId }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    try {
      // 获取消息验证权限
      const msg = await persistence.getDMMessage(messageId, conversationId);
      if (!msg) {
        return callback && callback({ success: false, error: '消息不存在' });
      }

      // 检查是否是自己的消息或管理员
      if (msg.sender_id !== user.persistentId && !user.isAdmin) {
        return callback && callback({ success: false, error: '只能撤回自己的消息' });
      }

      // 检查时间限制（2分钟内，管理员无限制）
      const msgTime = new Date(msg.timestamp).getTime();
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;
      if (!user.isAdmin && (now - msgTime) > twoMinutes) {
        return callback && callback({ success: false, error: '超过2分钟无法撤回' });
      }

      // 执行撤回
      await persistence.recallDMMessage(messageId, conversationId);

      // 广播给会话中的所有人
      io.to(`dm:${conversationId}`).emit('dm_message_recalled', { 
        messageId, 
        conversationId, 
        recalledBy: user.username 
      });

      if (callback) callback({ success: true });
      console.log(`DM message ${messageId} recalled by ${user.username}`);
    } catch (err) {
      console.error('Recall DM message error:', err);
      if (callback) callback({ success: false, error: '撤回失败' });
    }
  });

  // 19. 删除私聊消息 (管理员可删除任何消息，普通用户可删除自己的已撤回消息)
  socket.on('delete_dm_message', async ({ messageId, conversationId }, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    try {
      // 获取消息验证权限
      const msg = await persistence.getDMMessage(messageId, conversationId);
      if (!msg) {
        return callback && callback({ success: false, error: '消息不存在' });
      }

      // 权限检查：管理员可删除任何消息，普通用户只能删除自己的已撤回消息
      const isOwner = msg.sender_id === user.persistentId;
      const isRecalled = msg.recalled === 1;
      if (!user.isAdmin && !(isOwner && isRecalled)) {
        return callback && callback({ success: false, error: '只能删除自己已撤回的消息' });
      }

      // 执行删除
      const deleted = await persistence.deleteDMMessage(messageId, conversationId);
      if (!deleted) {
        return callback && callback({ success: false, error: '删除失败' });
      }

      // 广播给会话中的所有人
      io.to(`dm:${conversationId}`).emit('dm_message_deleted', { messageId, conversationId });

      if (callback) callback({ success: true });
      console.log(`DM message ${messageId} deleted by ${user.username}`);
    } catch (err) {
      console.error('Delete DM message error:', err);
      if (callback) callback({ success: false, error: '删除失败' });
    }
  });

  // 20. 删除整个私聊会话
  socket.on('delete_conversation', async (conversationId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      return callback && callback({ success: false, error: 'Not logged in' });
    }

    try {
      const deleted = await persistence.deleteConversation(conversationId, user.persistentId);
      if (!deleted) {
        return callback && callback({ success: false, error: '删除失败或无权限' });
      }

      // 通知会话中的其他用户刷新列表
      io.to(`dm:${conversationId}`).emit('conversation_deleted', { conversationId });
      
      if (callback) callback({ success: true });
      console.log(`Conversation ${conversationId} deleted by ${user.username}`);
    } catch (err) {
      console.error('Delete conversation error:', err);
      if (callback) callback({ success: false, error: '删除失败' });
    }
  });
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log('User disconnected');
      
      // 先删除用户，再检查是否还有其他 session
      const persistentId = user.persistentId;
      users.delete(socket.id);
      
      // 检查该用户是否还有其他在线 session
      // 只有当用户完全下线时才通知私聊对象
      if (persistentId && !isUserOnline(persistentId)) {
        notifyDMContactsOnlineStatus(persistentId, false);
      }
      
      // If user was in a room, notify others and update counts
      if (user.currentRoom) {
        const roomId = user.currentRoom;
        
        // Only notify and update counts if not in stealth mode
        if (!user.isStealthInRoom) {
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

            // Update room count for users in that room
            const userCount = getVisibleUserCount(roomId);
            io.to(roomId).emit('room_user_count', { roomId, userCount });
            
            // Notify admins
            broadcastAdminRoomUpdate(roomId);
          }
        }
      }
    }
  });
});

// Handle SPA routing - return index.html for any unknown routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

cleanupOldImages();
setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);

const PORT = 3001; // Hardcoded to avoid .env conflicts
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('SecretSpace backend is ready.');
});
