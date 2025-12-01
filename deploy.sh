#!/bin/bash
set -e

# 配置
REPO_URL="https://github.com/Lkang123/secretspace.git"
APP_DIR="/var/www/secretspace"

echo "=== SecretSpace 自动部署脚本 ==="

# 1. 环境检查与安装 (Ubuntu/Debian)
echo ">>> 检查环境..."
if ! command -v node &> /dev/null; then
    echo "    安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "    安装 PM2..."
    npm install -g pm2
fi

if ! command -v git &> /dev/null; then
    echo "    安装 Git..."
    apt-get install -y git
fi

# 2. 代码部署/更新
if [ -d "$APP_DIR" ]; then
    echo ">>> 目录已存在，执行更新..."
    cd "$APP_DIR"
    # 防止 git lock 问题
    rm -f .git/index.lock
    git fetch --all
    git reset --hard origin/main
else
    echo ">>> 目录不存在，执行克隆..."
    mkdir -p /var/www
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 3. 安装依赖与构建
echo ">>> 安装后端依赖..."
npm install --no-audit

echo ">>> 构建前端..."
cd client
# 设置 npm 镜像防止连接超时 (可选)
# npm config set registry https://registry.npmmirror.com
npm install --no-audit
npm run build
cd ..

# 4. PM2 管理
echo ">>> 管理进程..."
if pm2 list | grep -q "secretspace"; then
    echo "    重启服务..."
    pm2 restart secretspace
else
    echo "    启动服务..."
    pm2 start server.js --name secretspace
fi

# 保存 PM2 状态以支持开机自启
pm2 save
# pm2 startup (通常只需运行一次，此处省略避免重复输出)

echo ""
echo "=== 部署成功! ==="
echo "服务运行在: http://$(curl -s ifconfig.me):3001"
