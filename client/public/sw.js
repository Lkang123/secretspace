// Service Worker for SecretSpace PWA
const CACHE_NAME = 'secretspace-v1';

// 安装事件
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 网络请求拦截 - 网络优先策略
self.addEventListener('fetch', (event) => {
  // 对于 API 和 WebSocket 请求，直接使用网络
  if (
    event.request.url.includes('/socket.io') ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/uploads/')
  ) {
    return;
  }
  
  // 其他请求使用网络优先策略
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 处理推送通知（未来扩展）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title || 'SecretSpace', {
      body: data.body || '您有新消息',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png'
    });
  }
});

// 处理通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
