// Code block functionality - wait for theme to initialize
function initCodeBlocks() {
  const codeBlocks = document.querySelectorAll('.code-block');
  
  codeBlocks.forEach(function(codeBlock) {
    const codeTitle = codeBlock.querySelector('.code-header > .code-title');
    const copyBtn = codeBlock.querySelector('.code-header .copy');
    
    if (codeTitle) {
      codeTitle.addEventListener('click', function() {
        codeBlock.classList.toggle('open');
      });
    }
    
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        const code = codeBlock.querySelector('code');
        if (code) {
          navigator.clipboard.writeText(code.innerText).then(function() {
            // Use animate.css flash effect like LoveIt theme
            const codeLines = code.querySelectorAll('span.cl');
            if (codeLines.length > 0) {
              codeLines.forEach(function(codeLine) {
                codeLine.classList.add('animate__animated', 'animate__flash');
                setTimeout(function() {
                  codeLine.classList.remove('animate__animated', 'animate__flash');
                }, 1000);
              });
            } else {
              // Fallback for code without line spans
              code.classList.add('animate__animated', 'animate__flash');
              setTimeout(function() {
                code.classList.remove('animate__animated', 'animate__flash');
              }, 1000);
            }
          });
        }
      });
    }
  });
}

// Initialize after a short delay to ensure theme is loaded
setTimeout(initCodeBlocks, 200);
