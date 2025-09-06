// Simple clipboard functionality
window.ClipboardJS = function(element) {
  this.element = element;
  this.callbacks = {};
  
  element.addEventListener('click', () => {
    const text = element.getAttribute('data-clipboard-text');
    navigator.clipboard.writeText(text).then(() => {
      if (this.callbacks.success) {
        this.callbacks.success();
      }
    });
  });
};

window.ClipboardJS.prototype.on = function(event, callback) {
  this.callbacks[event] = callback;
};
