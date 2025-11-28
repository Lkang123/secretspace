// Generate a consistent color based on username
const avatarColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

export function getAvatarColor(name) {
  if (!name) return avatarColors[0];
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
}

export function getInitials(name) {
  if (!name) return '??';
  return name.slice(0, 2).toUpperCase();
}

// Generate DiceBear avatar URL
export function getAvatarUrl(name) {
  if (!name) name = 'default';
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

// Preset avatar seeds (20 fixed avatars)
export const PRESET_AVATARS = [
  'Felix', 'Aneka', 'Milo', 'Jasper', 'Luna',
  'Coco', 'Pepper', 'Shadow', 'Ginger', 'Biscuit',
  'Muffin', 'Cookie', 'Peanut', 'Oreo', 'Mocha',
  'Caramel', 'Maple', 'Honey', 'Cinnamon', 'Vanilla'
];

// Get avatar URL by preset ID (0-19) or fallback to username
export function getPresetAvatarUrl(avatarId, fallbackName) {
  if (avatarId !== null && avatarId !== undefined && avatarId >= 0 && avatarId < PRESET_AVATARS.length) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${PRESET_AVATARS[avatarId]}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }
  return getAvatarUrl(fallbackName);
}
