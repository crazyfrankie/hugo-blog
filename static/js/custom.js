document.addEventListener('DOMContentLoaded', function() {
  // 直接用JavaScript强制修改语言选择器样式
  const langSelect = document.getElementById('language-select-desktop');
  if (langSelect) {
    langSelect.style.cssText = `
      background: rgba(255, 255, 255, 0.95) !important;
      border: 2px solid rgba(0, 102, 204, 0.5) !important;
      border-radius: 8px !important;
      padding: 8px 12px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      outline: none !important;
      font-size: 14px !important;
      color: #333 !important;
      transition: all 0.3s ease !important;
      min-width: 120px !important;
      width: auto !important;
      margin-left: 8px !important;
    `;
    
    // 确保父容器不遮挡
    const langContainer = langSelect.closest('.menu-item.language');
    if (langContainer) {
      langContainer.style.overflow = 'visible';
      langContainer.style.position = 'relative';
    }
  }
});
