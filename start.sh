#!/bin/bash

# SecretSpace 启动脚本
cd /var/www/secretspace

echo "=== 构建 SecretSpace ==="

# 1. 安装后端依赖
echo ">>> 安装后端依赖..."
npm install

# 2. 构建前端
echo ">>> 构建前端..."
cd client
npm install
npm run build
cd ..

# 3. 停止旧进程（如果存在）
echo ">>> 停止旧进程..."
pm2 delete secretspace 2>/dev/null || true

# 4. 启动应用
echo ">>> 启动应用..."
pm2 start server.js --name secretspace

# 5. 设置开机自启
pm2 save
pm2 startup

# 6. 显示状态
echo ""
echo "=== 部署完成！ ==="
pm2 status

echo ""
echo "访问地址: http://你的服务器IP:3001"
echo ""
echo "常用命令："
echo "  查看日志: pm2 logs secretspace"
echo "  重启应用: pm2 restart secretspace"
echo "  停止应用: pm2 stop secretspace"
