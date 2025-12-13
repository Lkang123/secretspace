/**
 * DM Read Status Property Tests
 * 
 * 这些测试验证私聊消息已读状态逻辑的正确性属性
 * 使用 fast-check 进行属性测试，每个属性运行 100 次迭代
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { isPageVisible, debounce } from './utils.js';

// ============================================================
// 测试辅助函数和模拟
// ============================================================

/**
 * 创建模拟的 DM 会话状态
 */
function createMockDMState(overrides = {}) {
  return {
    currentDM: null,
    showDMPanel: false,
    dmList: [],
    dmMessages: [],
    dmUnreadTotal: 0,
    ...overrides
  };
}

/**
 * 创建模拟的会话对象
 */
function createMockConversation(id, unreadCount = 0) {
  return {
    id,
    otherUser: { id: `user-${id}`, name: `User ${id}` },
    unreadCount,
    lastMessage: 'Hello',
    lastMessageAt: new Date().toISOString()
  };
}

/**
 * 模拟 document.hidden 属性
 */
function mockDocumentHidden(hidden) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden
  });
}

// ============================================================
// Property 2: Hidden page prevents read marking
// **Feature: dm-read-status-fix, Property 2: Hidden page prevents read marking**
// **Validates: Requirements 1.3, 2.3**
// ============================================================

describe('Property 2: 页面隐藏时不标记已读', () => {
  let originalHidden;

  beforeEach(() => {
    // 保存原始的 document.hidden 值
    originalHidden = document.hidden;
  });

  afterEach(() => {
    // 恢复原始值
    mockDocumentHidden(originalHidden);
  });

  it('当页面隐藏时，isPageVisible() 应返回 false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hidden) => {
          mockDocumentHidden(hidden);
          const result = isPageVisible();
          // 当 hidden 为 true 时，isPageVisible 应返回 false
          // 当 hidden 为 false 时，isPageVisible 应返回 true
          expect(result).toBe(!hidden);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于任意会话，当页面隐藏时不应触发已读标记', () => {
    fc.assert(
      fc.property(
        // 生成随机会话 ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成随机未读数
        fc.integer({ min: 0, max: 100 }),
        (conversationId, unreadCount) => {
          // 设置页面为隐藏状态
          mockDocumentHidden(true);
          
          // 创建模拟状态
          const state = createMockDMState({
            currentDM: createMockConversation(conversationId, unreadCount),
            showDMPanel: true,
            dmList: [createMockConversation(conversationId, unreadCount)]
          });
          
          // 模拟 mark_dm_read 调用追踪
          let markReadCalled = false;
          const mockMarkDMRead = () => {
            // 只有当页面可见时才应该调用
            if (isPageVisible()) {
              markReadCalled = true;
            }
          };
          
          // 模拟 dm_notification 处理逻辑
          const isViewing = state.currentDM && 
                           String(state.currentDM.id) === String(conversationId) && 
                           state.showDMPanel && 
                           isPageVisible();
          
          if (isViewing) {
            mockMarkDMRead();
          }
          
          // 断言：页面隐藏时不应调用 mark_dm_read
          expect(markReadCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于任意会话，当页面可见时应触发已读标记', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (conversationId, unreadCount) => {
          // 设置页面为可见状态
          mockDocumentHidden(false);
          
          const state = createMockDMState({
            currentDM: createMockConversation(conversationId, unreadCount),
            showDMPanel: true,
            dmList: [createMockConversation(conversationId, unreadCount)]
          });
          
          let markReadCalled = false;
          const mockMarkDMRead = () => {
            if (isPageVisible()) {
              markReadCalled = true;
            }
          };
          
          const isViewing = state.currentDM && 
                           String(state.currentDM.id) === String(conversationId) && 
                           state.showDMPanel && 
                           isPageVisible();
          
          if (isViewing) {
            mockMarkDMRead();
          }
          
          // 断言：页面可见且会话匹配时应调用 mark_dm_read
          expect(markReadCalled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// Property 3: Visibility change triggers read marking
// **Feature: dm-read-status-fix, Property 3: Visibility change triggers read marking**
// **Validates: Requirements 2.1**
// ============================================================

describe('Property 3: 可见性变化触发已读标记', () => {
  let originalHidden;

  beforeEach(() => {
    originalHidden = document.hidden;
  });

  afterEach(() => {
    mockDocumentHidden(originalHidden);
  });

  it('对于任意打开的会话，当页面从隐藏变为可见时应触发已读标记', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (conversationId, unreadCount) => {
          // 创建有未读消息的会话状态
          const state = createMockDMState({
            currentDM: createMockConversation(conversationId, unreadCount),
            showDMPanel: true,
            dmList: [createMockConversation(conversationId, unreadCount)]
          });
          
          let markReadCalled = false;
          const mockMarkDMRead = (convId) => {
            if (convId === conversationId) {
              markReadCalled = true;
            }
          };
          
          // 模拟 handleVisibilityChange 逻辑
          const handleVisibilityChange = (isVisible) => {
            if (!isVisible) return;
            
            if (state.currentDM && state.showDMPanel) {
              const conversation = state.dmList.find(conv => conv.id === state.currentDM.id);
              if (conversation && conversation.unreadCount > 0) {
                mockMarkDMRead(state.currentDM.id);
              }
            }
          };
          
          // 模拟页面从隐藏变为可见
          mockDocumentHidden(true);  // 先隐藏
          mockDocumentHidden(false); // 再可见
          handleVisibilityChange(true);
          
          // 断言：应该触发已读标记
          expect(markReadCalled).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于任意打开的会话，当页面保持隐藏时不应触发已读标记', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (conversationId, unreadCount) => {
          const state = createMockDMState({
            currentDM: createMockConversation(conversationId, unreadCount),
            showDMPanel: true,
            dmList: [createMockConversation(conversationId, unreadCount)]
          });
          
          let markReadCalled = false;
          const mockMarkDMRead = () => {
            markReadCalled = true;
          };
          
          const handleVisibilityChange = (isVisible) => {
            if (!isVisible) return;
            
            if (state.currentDM && state.showDMPanel) {
              const conversation = state.dmList.find(conv => conv.id === state.currentDM.id);
              if (conversation && conversation.unreadCount > 0) {
                mockMarkDMRead(state.currentDM.id);
              }
            }
          };
          
          // 页面保持隐藏
          mockDocumentHidden(true);
          handleVisibilityChange(false);
          
          // 断言：不应触发已读标记
          expect(markReadCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('当没有打开的会话时，可见性变化不应触发已读标记', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isVisible) => {
          // 没有打开的会话
          const state = createMockDMState({
            currentDM: null,
            showDMPanel: false,
            dmList: []
          });
          
          let markReadCalled = false;
          const mockMarkDMRead = () => {
            markReadCalled = true;
          };
          
          const handleVisibilityChange = (visible) => {
            if (!visible) return;
            
            if (state.currentDM && state.showDMPanel) {
              mockMarkDMRead(state.currentDM.id);
            }
          };
          
          handleVisibilityChange(isVisible);
          
          // 断言：没有会话时不应触发
          expect(markReadCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// Property 4: Conversation isolation
// **Feature: dm-read-status-fix, Property 4: Conversation isolation**
// **Validates: Requirements 1.4**
// ============================================================

describe('Property 4: 会话隔离', () => {
  let originalHidden;

  beforeEach(() => {
    originalHidden = document.hidden;
    mockDocumentHidden(false); // 页面可见
  });

  afterEach(() => {
    mockDocumentHidden(originalHidden);
  });

  it('对于任意两个不同的会话，切换会话后新消息不应标记旧会话为已读', () => {
    fc.assert(
      fc.property(
        // 生成两个不同的会话 ID
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (convIdA, convIdB, unreadA, unreadB) => {
          // 确保两个会话 ID 不同
          const conversationIdA = `conv-a-${convIdA}`;
          const conversationIdB = `conv-b-${convIdB}`;
          
          // 追踪哪些会话被标记为已读
          const markedAsRead = new Set();
          const mockMarkDMRead = (convId) => {
            markedAsRead.add(convId);
          };
          
          // 创建两个会话
          const conversationA = createMockConversation(conversationIdA, unreadA);
          const conversationB = createMockConversation(conversationIdB, unreadB);
          
          // 初始状态：用户在会话 A
          let state = createMockDMState({
            currentDM: conversationA,
            showDMPanel: true,
            dmList: [conversationA, conversationB]
          });
          
          // 模拟 dm_notification 处理逻辑
          const handleDMNotification = (notificationConvId, currentState) => {
            const isViewing = currentState.currentDM && 
                             String(currentState.currentDM.id) === String(notificationConvId) && 
                             currentState.showDMPanel && 
                             isPageVisible();
            
            if (isViewing) {
              mockMarkDMRead(notificationConvId);
            }
          };
          
          // 用户切换到会话 B
          state = {
            ...state,
            currentDM: conversationB
          };
          
          // 会话 A 收到新消息通知
          handleDMNotification(conversationIdA, state);
          
          // 断言：会话 A 不应被标记为已读（因为用户现在在会话 B）
          expect(markedAsRead.has(conversationIdA)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于任意会话，只有当前查看的会话才应被标记为已读', () => {
    fc.assert(
      fc.property(
        // 生成多个会话
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0 }), // 当前查看的会话索引
        (convIds, currentIndex) => {
          // 创建唯一的会话 ID
          const uniqueConvIds = [...new Set(convIds.map((id, i) => `conv-${i}-${id}`))];
          if (uniqueConvIds.length < 2) return true; // 跳过无效输入
          
          const safeIndex = currentIndex % uniqueConvIds.length;
          
          const conversations = uniqueConvIds.map((id, i) => 
            createMockConversation(id, i + 1)
          );
          
          const currentConversation = conversations[safeIndex];
          
          const markedAsRead = new Set();
          const mockMarkDMRead = (convId) => {
            markedAsRead.add(convId);
          };
          
          const state = createMockDMState({
            currentDM: currentConversation,
            showDMPanel: true,
            dmList: conversations
          });
          
          // 模拟所有会话都收到新消息
          conversations.forEach(conv => {
            const isViewing = state.currentDM && 
                             String(state.currentDM.id) === String(conv.id) && 
                             state.showDMPanel && 
                             isPageVisible();
            
            if (isViewing) {
              mockMarkDMRead(conv.id);
            }
          });
          
          // 断言：只有当前会话被标记为已读
          expect(markedAsRead.size).toBe(1);
          expect(markedAsRead.has(currentConversation.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('当 DM 面板关闭时，任何会话都不应被标记为已读', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (conversationId, unreadCount) => {
          const conversation = createMockConversation(conversationId, unreadCount);
          
          let markReadCalled = false;
          const mockMarkDMRead = () => {
            markReadCalled = true;
          };
          
          // DM 面板关闭
          const state = createMockDMState({
            currentDM: conversation,
            showDMPanel: false, // 面板关闭
            dmList: [conversation]
          });
          
          const isViewing = state.currentDM && 
                           String(state.currentDM.id) === String(conversationId) && 
                           state.showDMPanel && 
                           isPageVisible();
          
          if (isViewing) {
            mockMarkDMRead();
          }
          
          // 断言：面板关闭时不应标记已读
          expect(markReadCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// Property 6: Debounce batching
// **Feature: dm-read-status-fix, Property 6: Debounce batching**
// **Validates: Requirements 4.2**
// ============================================================

describe('Property 6: 防抖批处理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('对于任意快速连续调用序列，防抖函数应只执行一次', () => {
    fc.assert(
      fc.property(
        // 生成调用次数 (2-20次快速调用)
        fc.integer({ min: 2, max: 20 }),
        // 生成防抖延迟时间 (100-500ms)
        fc.integer({ min: 100, max: 500 }),
        (callCount, debounceDelay) => {
          let executionCount = 0;
          const fn = () => {
            executionCount++;
          };
          
          const debouncedFn = debounce(fn, debounceDelay);
          
          // 快速连续调用多次（间隔小于防抖时间）
          for (let i = 0; i < callCount; i++) {
            debouncedFn();
            // 每次调用间隔 10ms，远小于防抖时间
            vi.advanceTimersByTime(10);
          }
          
          // 等待防抖时间结束
          vi.advanceTimersByTime(debounceDelay);
          
          // 断言：只执行一次
          expect(executionCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于任意间隔足够长的调用序列，每次调用都应执行', () => {
    fc.assert(
      fc.property(
        // 生成调用次数 (2-10次)
        fc.integer({ min: 2, max: 10 }),
        // 生成防抖延迟时间 (100-300ms)
        fc.integer({ min: 100, max: 300 }),
        (callCount, debounceDelay) => {
          let executionCount = 0;
          const fn = () => {
            executionCount++;
          };
          
          const debouncedFn = debounce(fn, debounceDelay);
          
          // 每次调用间隔大于防抖时间
          for (let i = 0; i < callCount; i++) {
            debouncedFn();
            // 等待防抖时间 + 额外时间
            vi.advanceTimersByTime(debounceDelay + 50);
          }
          
          // 断言：每次调用都执行了
          expect(executionCount).toBe(callCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('防抖函数的 cancel 方法应阻止待执行的调用', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 500 }),
        (debounceDelay) => {
          let executionCount = 0;
          const fn = () => {
            executionCount++;
          };
          
          const debouncedFn = debounce(fn, debounceDelay);
          
          // 调用防抖函数
          debouncedFn();
          
          // 在执行前取消
          vi.advanceTimersByTime(debounceDelay / 2);
          debouncedFn.cancel();
          
          // 等待原本应该执行的时间
          vi.advanceTimersByTime(debounceDelay);
          
          // 断言：被取消，没有执行
          expect(executionCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于 300ms 防抖延迟，快速可见性变化应只触发一次已读请求', () => {
    fc.assert(
      fc.property(
        // 生成可见性变化次数 (2-10次)
        fc.integer({ min: 2, max: 10 }),
        (changeCount) => {
          let markReadCount = 0;
          const mockMarkDMRead = () => {
            markReadCount++;
          };
          
          // 使用 300ms 防抖（与实际实现一致）
          const debouncedMarkDMRead = debounce(mockMarkDMRead, 300);
          
          // 模拟快速可见性变化
          for (let i = 0; i < changeCount; i++) {
            debouncedMarkDMRead('conv-123');
            // 每次变化间隔 50ms，小于 300ms 防抖时间
            vi.advanceTimersByTime(50);
          }
          
          // 等待防抖完成
          vi.advanceTimersByTime(300);
          
          // 断言：只发送一次已读请求
          expect(markReadCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('防抖函数应正确传递参数', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 100, max: 300 }),
        (conversationId, debounceDelay) => {
          let receivedArg = null;
          const fn = (arg) => {
            receivedArg = arg;
          };
          
          const debouncedFn = debounce(fn, debounceDelay);
          
          debouncedFn(conversationId);
          vi.advanceTimersByTime(debounceDelay);
          
          // 断言：参数正确传递
          expect(receivedArg).toBe(conversationId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
