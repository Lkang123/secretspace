import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../client/public/icons');

// 创建一个简单的 SecretSpace 图标 (深色背景 + 白色 S)
const createIcon = async (size) => {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#18181b"/>
      <text 
        x="50%" 
        y="55%" 
        font-family="Arial, sans-serif" 
        font-size="${size * 0.55}" 
        font-weight="bold" 
        fill="white" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >S</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(outputDir, `icon-${size}.png`));

  console.log(`Generated icon-${size}.png`);
};

// 生成 192x192 和 512x512 图标
await createIcon(192);
await createIcon(512);

console.log('Icons generated successfully!');
