document.addEventListener('DOMContentLoaded', function() {
  // 隐藏默认的语言切换器
  const defaultLangSwitcher = document.querySelector('.menu-item.language');
  if (defaultLangSwitcher) {
    defaultLangSwitcher.style.display = 'none';
  }
});
