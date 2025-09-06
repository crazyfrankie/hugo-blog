// 标题锚点功能
function initHeaderLinks() {
  // 为h1-h6标题添加锚点链接
  for (let num = 1; num <= 6; num++) {
    const headers = document.querySelectorAll('.content h' + num + '[id]');
    headers.forEach(function(header) {
      header.classList.add('header-link');
      header.insertAdjacentHTML('afterbegin', 
        '<a href="#' + header.id + '" class="header-mark"></a>'
      );
    });
  }
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initHeaderLinks();
});
