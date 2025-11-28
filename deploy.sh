#!/bin/bash

# SecretSpace 部署脚本
# 在 Linux 服务器上运行

echo "=== SecretSpace 部署开始 ==="

# 1. 更新系统
echo ">>> 更新系统..."
apt update && apt upgrade -y

# 2. 安装 Node.js 18
echo ">>> 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 3. 安装 Git
echo ">>> 安装 Git..."
apt install -y git

# 4. 安装 PM2（进程管理器）
echo ">>> 安装 PM2..."
npm install -g pm2

# 5. 创建应用目录
echo ">>> 创建应用目录..."
mkdir -p /var/www/secretspace
cd /var/www/secretspace

# 6. 提示用户上传代码
echo ""
echo "=== 请上传代码到 /var/www/secretspace ==="
echo "可以使用以下方式："
echo "1. git clone <你的仓库地址>"
echo "2. 使用 FileZilla/WinSCP 上传文件"
echo ""
echo "上传完成后运行: bash /var/www/secretspace/start.sh"
