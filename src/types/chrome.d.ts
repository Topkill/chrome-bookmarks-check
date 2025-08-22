/// <reference types="chrome" />

// 扩展Chrome API类型定义
declare global {
  const chrome: typeof chrome;
  
  interface Window {
    chrome: typeof chrome;
  }
}

export {};