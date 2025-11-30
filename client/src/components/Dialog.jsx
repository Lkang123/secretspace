import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { create } from 'zustand';

// 全局弹窗状态管理
export const useDialogStore = create((set, get) => ({
  dialogs: [],
  
  // 显示弹窗
  show: ({ type = 'confirm', title, message, confirmText, cancelText, variant = 'default', onConfirm, onCancel }) => {
    const id = Date.now();
    const dialog = {
      id,
      type,
      title,
      message,
      confirmText: confirmText || (type === 'alert' ? '确定' : '确定'),
      cancelText: cancelText || '取消',
      variant,
      onConfirm,
      onCancel,
    };
    set({ dialogs: [...get().dialogs, dialog] });
    return id;
  },
  
  // 关闭弹窗
  close: (id) => {
    set({ dialogs: get().dialogs.filter(d => d.id !== id) });
  },
  
  // 关闭所有弹窗
  closeAll: () => {
    set({ dialogs: [] });
  },
}));

// 便捷方法
export const showAlert = (message, options = {}) => {
  return new Promise((resolve) => {
    useDialogStore.getState().show({
      type: 'alert',
      title: options.title || '提示',
      message,
      confirmText: options.confirmText,
      variant: options.variant || 'info',
      onConfirm: resolve,
    });
  });
};

export const showConfirm = (message, options = {}) => {
  return new Promise((resolve) => {
    useDialogStore.getState().show({
      type: 'confirm',
      title: options.title || '确认',
      message,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      variant: options.variant || 'default',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
};

// 弹窗组件
function DialogItem({ dialog, onClose }) {
  const { id, type, title, message, confirmText, cancelText, variant, onConfirm, onCancel } = dialog;
  
  const handleConfirm = () => {
    onConfirm?.();
    onClose(id);
  };
  
  const handleCancel = () => {
    onCancel?.();
    onClose(id);
  };
  
  const variantConfig = {
    default: {
      icon: null,
      confirmStyle: 'bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-black',
    },
    info: {
      icon: <Info size={24} className="text-blue-500" />,
      confirmStyle: 'bg-blue-500 hover:bg-blue-600 text-white',
    },
    success: {
      icon: <CheckCircle size={24} className="text-green-500" />,
      confirmStyle: 'bg-green-500 hover:bg-green-600 text-white',
    },
    warning: {
      icon: <AlertTriangle size={24} className="text-amber-500" />,
      confirmStyle: 'bg-amber-500 hover:bg-amber-600 text-white',
    },
    danger: {
      icon: <AlertCircle size={24} className="text-red-500" />,
      confirmStyle: 'bg-red-500 hover:bg-red-600 text-white',
    },
  };
  
  const config = variantConfig[variant] || variantConfig.default;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={type === 'alert' ? handleConfirm : handleCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            {config.icon}
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h3>
          </div>
          <button
            onClick={type === 'alert' ? handleConfirm : handleCancel}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-[15px] text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-zinc-200 dark:border-zinc-800">
          {type === 'confirm' && (
            <button
              onClick={handleCancel}
              className="flex-1 h-11 rounded-full bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-white text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`flex-1 h-11 rounded-full text-sm font-bold transition-colors ${config.confirmStyle}`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 全局弹窗容器组件
export default function DialogContainer() {
  const { dialogs, close } = useDialogStore();
  
  return (
    <AnimatePresence>
      {dialogs.map((dialog) => (
        <DialogItem key={dialog.id} dialog={dialog} onClose={close} />
      ))}
    </AnimatePresence>
  );
}
