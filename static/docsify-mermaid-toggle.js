// docsify-mermaid-toggle.js
(function () {
    // 1. 注入 CSS 样式
    var css = `
      .mermaid-wrapper {
        position: relative;
        border: 1px solid #eee;
        padding: 10px;
        margin: 20px 0;
        border-radius: 4px;
        transition: all 0.2s;
      }
      .mermaid-wrapper:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }
      .mermaid-toggle-btn {
        position: absolute;
        top: 5px;
        right: 5px;
        z-index: 10;
        background: #f8f8f8;
        border: 1px solid #ddd;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        color: #666;
        opacity: 0; 
        transition: opacity 0.3s;
      }
      .mermaid-wrapper:hover .mermaid-toggle-btn {
        opacity: 1;
      }
      .mermaid-source {
        display: none;
        background: #f8f8f8;
        padding: 10px;
        margin-top: 10px;
        border-radius: 4px;
        font-family: Consolas, Monaco, "Andale Mono", monospace;
        font-size: 12px;
        overflow-x: auto;
        white-space: pre;
        border: 1px solid #eee;
      }
      .mermaid svg {
        max-width: 100%;
        margin: 0 auto;
        display: block;
      }
    `;
    
    var style = document.createElement('style');
    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
    document.head.appendChild(style);
  
    // 2. 全局切换函数
    window.toggleMermaid = function(id) {
      var viewEl = document.getElementById(id + '-view');
      var sourceEl = document.getElementById(id + '-source');
      var btnEl = document.getElementById(id + '-btn');
      if (sourceEl.style.display === 'block') {
        // 切换到图表模式
        sourceEl.style.display = 'none';
        viewEl.style.display = 'block';
        btnEl.innerText = '查看源码';
      } else {
        // 切换到源码模式
        sourceEl.style.display = 'block';
        viewEl.style.display = 'none';
        btnEl.innerText = '查看图表';
      }
    };
  
    // 3. 插件核心逻辑
    var mermaidTogglePlugin = function(hook, vm) {
      hook.afterEach(function(html, next) {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        var mermaidPres = tempDiv.querySelectorAll('pre[data-lang="mermaid"]');
  
        mermaidPres.forEach(function(preElement) {
          var code = preElement.textContent;
          var id = "mermaid-" + Math.random().toString(36).substr(2, 9);
          var wrapper = document.createElement('div');
          wrapper.className = 'mermaid-wrapper';
          
          wrapper.innerHTML = `
            <button id="${id}-btn" class="mermaid-toggle-btn" onclick="toggleMermaid('${id}')">查看源码</button>
            <div id="${id}-view" class="mermaid">${code}</div>
            <div id="${id}-source" class="mermaid-source"></div>
          `;
          wrapper.querySelector('.mermaid-source').innerText = code;
          preElement.parentNode.replaceChild(wrapper, preElement);
        });
        next(tempDiv.innerHTML);
      });
  
      hook.doneEach(function() {
        var candidates = document.querySelectorAll('.mermaid');
        if (candidates.length && typeof mermaid !== 'undefined') {
          mermaid.run({ nodes: candidates });
        }
      });
    };
  
    window.$docsify.plugins = [].concat(mermaidTogglePlugin, window.$docsify.plugins);
  })();