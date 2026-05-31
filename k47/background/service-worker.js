const DB_NAME = 'DomSnapshotDB';
const DB_VERSION = 2;
const STORE_NAME = 'snapshots';
const META_STORE = 'snapshotMeta';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        const meta = db.createObjectStore(META_STORE, { keyPath: 'id' });
        meta.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveSnapshot(snapshot) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = {
      id,
      name: snapshot.name || `Snapshot ${new Date().toLocaleString()}`,
      url: snapshot.url || '',
      timestamp: Date.now(),
      nodeCount: snapshot.nodeCount || 0,
      totalDomNodes: snapshot.totalDomNodes || 0,
      truncated: snapshot.truncated || false,
      domTree: snapshot.domTree,
    };
    const metaRecord = {
      id,
      name: record.name,
      url: record.url,
      timestamp: record.timestamp,
      nodeCount: record.nodeCount,
      totalDomNodes: record.totalDomNodes,
      truncated: record.truncated,
    };

    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.objectStore(META_STORE).add(metaRecord);
    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAllSnapshotMetas() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = req.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllSnapshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = req.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getSnapshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteSnapshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.objectStore(META_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function renameSnapshot(id, newName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(META_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) {
        tx.abort();
        return reject(new Error('Snapshot not found'));
      }
      record.name = newName;
      store.put(record);
      const metaReq = metaStore.get(id);
      metaReq.onsuccess = () => {
        if (metaReq.result) {
          metaReq.result.name = newName;
          metaStore.put(metaReq.result);
        }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function estimateDomSize() {
  let count = 0;
  const walk = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  );
  while (walk.nextNode()) {
    count++;
    if (count > 100000) break;
  }
  return count;
}

function compareNodes(nodeA, nodeB, path) {
  const diffs = [];
  const stack = [{ a: nodeA, b: nodeB, path: path || '' }];

  while (stack.length > 0) {
    const { a, b, path: currentPath } = stack.pop();

    if (!a && b) {
      diffs.push({ type: 'added', path: currentPath, tagName: b.tagName, id: b.id, className: b.className });
      continue;
    }
    if (a && !b) {
      diffs.push({ type: 'removed', path: currentPath, tagName: a.tagName, id: a.id, className: a.className });
      continue;
    }
    if (!a && !b) continue;

    const resolvedPath = currentPath || a.xpath || a.tagName;

    const styleChanges = {};
    const styleA = a.computedStyle || {};
    const styleB = b.computedStyle || {};
    const allStyleKeys = new Set([...Object.keys(styleA), ...Object.keys(styleB)]);
    let hasStyleChange = false;
    for (const key of allStyleKeys) {
      if (styleA[key] !== styleB[key]) {
        styleChanges[key] = { old: styleA[key] || '', new: styleB[key] || '' };
        hasStyleChange = true;
      }
    }

    const attrChanges = {};
    if (a.tagName !== b.tagName) attrChanges.tagName = { old: a.tagName, new: b.tagName };
    if (a.id !== b.id) attrChanges.id = { old: a.id || '', new: b.id || '' };
    if (a.className !== b.className) attrChanges.className = { old: a.className || '', new: b.className || '' };

    if (Object.keys(attrChanges).length > 0 || hasStyleChange) {
      diffs.push({
        type: 'modified',
        path: resolvedPath,
        tagName: a.tagName,
        id: a.id,
        className: a.className,
        attributeChanges: attrChanges,
        styleChanges,
      });
    }

    const childrenA = a.children || [];
    const childrenB = b.children || [];
    const maxLen = Math.max(childrenA.length, childrenB.length);

    for (let i = maxLen - 1; i >= 0; i--) {
      const childA = childrenA[i] || null;
      const childB = childrenB[i] || null;
      const childPath = childA ? childA.xpath : (childB ? childB.xpath : `${resolvedPath}/child[${i}]`);
      stack.push({ a: childA, b: childB, path: childPath });
    }
  }

  return diffs;
}

function compareSnapshots(treeA, treeB) {
  return compareNodes(treeA, treeB, '');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    try {
      switch (message.type) {
        case 'SAVE_SNAPSHOT':
          return await saveSnapshot(message.data);
        case 'GET_ALL_SNAPSHOTS':
          return await getAllSnapshotMetas();
        case 'GET_SNAPSHOT':
          return await getSnapshot(message.id);
        case 'DELETE_SNAPSHOT':
          return await deleteSnapshot(message.id);
        case 'RENAME_SNAPSHOT':
          return await renameSnapshot(message.id, message.name);
        case 'COMPARE_SNAPSHOTS': {
          const snapA = await getSnapshot(message.idA);
          const snapB = await getSnapshot(message.idB);
          if (!snapA || !snapB) throw new Error('Snapshot not found');
          const diffs = compareSnapshots(snapA.domTree, snapB.domTree);
          const metaA = { name: snapA.name, url: snapA.url, nodeCount: snapA.nodeCount, totalDomNodes: snapA.totalDomNodes, truncated: snapA.truncated };
          const metaB = { name: snapB.name, url: snapB.url, nodeCount: snapB.nodeCount, totalDomNodes: snapB.totalDomNodes, truncated: snapB.truncated };
          return { diffs, snapshotA: metaA, snapshotB: metaB };
        }
        case 'ESTIMATE_DOM_SIZE': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) throw new Error('No active tab');
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: estimateDomSize,
          });
          if (!results || !results[0]) throw new Error('Failed to estimate DOM size');
          return { totalDomNodes: results[0].result };
        }
        case 'CAPTURE_DOM': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) throw new Error('No active tab');
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: captureDOM,
            args: [message.options || {}],
          });
          if (!results || !results[0]) throw new Error('Failed to capture DOM');
          return results[0].result;
        }
        case 'LOCATE_ELEMENT': {
          const xpath = message.xpath;
          const targetUrl = message.targetUrl;
          const diffType = message.diffType || 'modified';

          if (!xpath) {
            return { error: 'XPath is required', found: false };
          }

          let tabs = await chrome.tabs.query({ url: targetUrl + '*' });
          if (tabs.length === 0) {
            try {
              const urlObj = new URL(targetUrl);
              const baseUrl = urlObj.origin + urlObj.pathname;
              tabs = await chrome.tabs.query({ url: baseUrl + '*' });
            } catch (e) {}
          }
          if (tabs.length === 0) {
            tabs = await chrome.tabs.query({});
          }

          let targetTab = null;
          if (targetUrl) {
            for (const tab of tabs) {
              if (tab.url && (tab.url === targetUrl || tab.url.startsWith(targetUrl))) {
                targetTab = tab;
                break;
              }
            }
          }
          if (!targetTab && tabs.length > 0) {
            targetTab = tabs[0];
          }

          if (!targetTab) {
            return { error: '未找到匹配的标签页，请先在浏览器中打开目标页面', found: false };
          }

          await chrome.tabs.update(targetTab.id, { active: true });
          const windowId = targetTab.windowId;
          if (windowId) {
            await chrome.windows.update(windowId, { focused: true });
          }

          const colorMap = {
            added: '#27ae60',
            removed: '#e74c3c',
            modified: '#f39c12',
          };
          const highlightColor = colorMap[diffType] || '#4A90D9';

          const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: locateAndHighlightElement,
            args: [xpath, highlightColor],
          });

          if (!results || !results[0] || !results[0].result) {
            return { found: false };
          }

          return { found: results[0].result.found };
        }
        default:
          throw new Error('Unknown message type: ' + message.type);
      }
    } catch (err) {
      return { error: err.message };
    }
  };

  handler().then(sendResponse);
  return true;
});

function captureDOM(options) {
  const MAX_NODES = options.maxNodes || 5000;
  const MAX_DEPTH = options.maxDepth || 20;
  const YIELD_INTERVAL = options.yieldInterval || 200;
  const SKIP_HIDDEN = options.skipHidden !== false;

  const SURFACE_STYLE_PROPS = [
    'width', 'height', 'color', 'backgroundColor',
    'fontSize', 'fontFamily', 'fontWeight',
    'display', 'position', 'opacity', 'visibility',
  ];

  const FULL_STYLE_PROPS = [
    'width', 'height',
    'color', 'backgroundColor',
    'fontSize', 'fontFamily', 'fontWeight',
    'display', 'position',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'opacity', 'visibility', 'overflow',
  ];

  let nodeCount = 0;
  let totalDomNodes = 0;
  let truncated = false;
  const xpathCache = new WeakMap();

  function getXPath(element) {
    if (xpathCache.has(element)) return xpathCache.get(element);
    if (element.id) {
      const path = `//*[@id="${element.id}"]`;
      xpathCache.set(element, path);
      return path;
    }
    if (element === document.body) {
      xpathCache.set(element, '/html/body');
      return '/html/body';
    }
    if (element === document.documentElement) {
      xpathCache.set(element, '/html');
      return '/html';
    }

    const parent = element.parentNode;
    if (!parent) {
      xpathCache.set(element, '');
      return '';
    }

    let idx = 1;
    const siblings = parent.children;
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i] === element) {
        const parentPath = getXPath(parent);
        const path = parentPath + `/${element.tagName.toLowerCase()}[${idx}]`;
        xpathCache.set(element, path);
        return path;
      }
      if (siblings[i].tagName === element.tagName) {
        idx++;
      }
    }
    xpathCache.set(element, '');
    return '';
  }

  function isElementVisible(node) {
    if (!SKIP_HIDDEN) return true;
    const style = node.style;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (node.offsetWidth === 0 && node.offsetHeight === 0) {
      if (style.display !== '') return false;
    }
    return true;
  }

  function shouldCaptureStyle(depth) {
    return depth <= 8;
  }

  function getStyleProps(depth) {
    return depth <= 3 ? FULL_STYLE_PROPS : SURFACE_STYLE_PROPS;
  }

  function traverseNodeSync(node, depth) {
    if (truncated) return null;
    if (depth > MAX_DEPTH) return null;
    if (node.nodeType !== 1) return null;

    totalDomNodes++;

    if (SKIP_HIDDEN && !isElementVisible(node)) return null;

    nodeCount++;
    if (nodeCount > MAX_NODES) {
      truncated = true;
      return null;
    }

    const result = {
      tagName: node.tagName,
      id: node.id || '',
      className: typeof node.className === 'string' ? node.className : '',
      xpath: getXPath(node),
      computedStyle: null,
      children: [],
    };

    if (shouldCaptureStyle(depth)) {
      const computed = window.getComputedStyle(node);
      const props = getStyleProps(depth);
      const style = {};
      for (let i = 0; i < props.length; i++) {
        style[props[i]] = computed.getPropertyValue(props[i]);
      }
      result.computedStyle = style;
    }

    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      if (truncated) break;
      const child = traverseNodeSync(children[i], depth + 1);
      if (child) result.children.push(child);
    }

    return result;
  }

  async function traverseNodeAsync(node, depth) {
    if (truncated) return null;
    if (depth > MAX_DEPTH) return null;
    if (node.nodeType !== 1) return null;

    totalDomNodes++;

    if (SKIP_HIDDEN && !isElementVisible(node)) return null;

    nodeCount++;
    if (nodeCount > MAX_NODES) {
      truncated = true;
      return null;
    }

    if (nodeCount % YIELD_INTERVAL === 0) {
      await new Promise(r => setTimeout(r, 0));
    }

    const result = {
      tagName: node.tagName,
      id: node.id || '',
      className: typeof node.className === 'string' ? node.className : '',
      xpath: getXPath(node),
      computedStyle: null,
      children: [],
    };

    if (shouldCaptureStyle(depth)) {
      const computed = window.getComputedStyle(node);
      const props = getStyleProps(depth);
      const style = {};
      for (let i = 0; i < props.length; i++) {
        style[props[i]] = computed.getPropertyValue(props[i]);
      }
      result.computedStyle = style;
    }

    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      if (truncated) break;
      const child = await traverseNodeAsync(children[i], depth + 1);
      if (child) result.children.push(child);
    }

    return result;
  }

  const useAsync = options.useAsync !== false;

  if (useAsync) {
    return (async () => {
      const tree = await traverseNodeAsync(document.documentElement, 0);
      return {
        domTree: tree,
        url: window.location.href,
        nodeCount,
        totalDomNodes,
        truncated,
      };
    })();
  } else {
    const tree = traverseNodeSync(document.documentElement, 0);
    return {
      domTree: tree,
      url: window.location.href,
      nodeCount,
      totalDomNodes,
      truncated,
    };
  }
}

function locateAndHighlightElement(xpath, highlightColor) {
  function findElementByXPath(xpathExpr) {
    try {
      const evaluator = new XPathEvaluator();
      const result = evaluator.evaluate(
        xpathExpr,
        document.documentElement,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  function clearPreviousHighlights() {
    const oldOverlays = document.querySelectorAll('.__dom_snapshot_overlay__');
    oldOverlays.forEach(el => el.remove());
    const oldLabels = document.querySelectorAll('.__dom_snapshot_label__');
    oldLabels.forEach(el => el.remove());
    const prevHighlight = document.querySelectorAll('.__dom_snapshot_highlight__');
    prevHighlight.forEach(el => {
      el.classList.remove('__dom_snapshot_highlight__');
      if (el.dataset.originalOutline !== undefined) {
        el.style.outline = el.dataset.originalOutline;
        delete el.dataset.originalOutline;
      }
      if (el.dataset.originalBoxShadow !== undefined) {
        el.style.boxShadow = el.dataset.originalBoxShadow;
        delete el.dataset.originalBoxShadow;
      }
    });
  }

  clearPreviousHighlights();

  const element = findElementByXPath(xpath);
  if (!element || element.nodeType !== 1) {
    return { found: false };
  }

  if (!element.getBoundingClientRect) {
    return { found: false };
  }

  const rect = element.getBoundingClientRect();
  const isVisible = rect.width > 0 && rect.height > 0;
  if (!isVisible) {
    element.style.display = 'block';
    element.style.visibility = 'visible';
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

  const overlay = document.createElement('div');
  overlay.className = '__dom_snapshot_overlay__';
  overlay.style.cssText = `
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    background: ${highlightColor};
    opacity: 0;
    border-radius: 4px;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(overlay);

  const label = document.createElement('div');
  label.className = '__dom_snapshot_label__';
  label.textContent = `<${element.tagName.toLowerCase()}> ${element.id ? '#' + element.id : ''} ${element.className ? '.' + String(element.className).split(' ').join('.') : ''}`;
  label.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: ${highlightColor};
    color: #fff;
    padding: 4px 10px;
    border-radius: 4px;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    opacity: 0;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(label);

  function updateOverlayPosition() {
    const elRect = element.getBoundingClientRect();
    const pad = 4;
    overlay.style.left = (elRect.left - pad) + 'px';
    overlay.style.top = (elRect.top - pad) + 'px';
    overlay.style.width = (elRect.width + pad * 2) + 'px';
    overlay.style.height = (elRect.height + pad * 2) + 'px';

    const labelRect = label.getBoundingClientRect();
    let labelTop = elRect.top - labelRect.height - 8;
    if (labelTop < 8) labelTop = elRect.bottom + 8;
    label.style.left = Math.max(8, elRect.left) + 'px';
    label.style.top = labelTop + 'px';
  }

  element.dataset.originalOutline = element.style.outline;
  element.dataset.originalBoxShadow = element.style.boxShadow;
  element.classList.add('__dom_snapshot_highlight__');

  let flashCount = 0;
  const maxFlashes = 6;
  let overlayVisible = false;

  function flash() {
    if (flashCount >= maxFlashes) {
      overlay.style.opacity = '0.25';
      label.style.opacity = '1';
      element.style.outline = `3px solid ${highlightColor}`;
      element.style.boxShadow = `0 0 20px ${highlightColor}80`;
      setTimeout(() => {
        element.style.outline = element.dataset.originalOutline || '';
        element.style.boxShadow = element.dataset.originalBoxShadow || '';
      }, 2500);
      setTimeout(() => {
        overlay.style.opacity = '0';
        label.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          label.remove();
        }, 350);
      }, 3000);
      return;
    }

    overlayVisible = !overlayVisible;
    overlay.style.opacity = overlayVisible ? '0.5' : '0';
    label.style.opacity = overlayVisible ? '1' : '0';

    if (overlayVisible) {
      element.style.outline = `3px solid ${highlightColor}`;
      element.style.boxShadow = `0 0 30px ${highlightColor}cc`;
    } else {
      element.style.outline = element.dataset.originalOutline || '';
      element.style.boxShadow = element.dataset.originalBoxShadow || '';
    }

    flashCount++;
    setTimeout(flash, 450);
  }

  requestAnimationFrame(() => {
    updateOverlayPosition();
    flash();
  });

  const scrollHandler = () => updateOverlayPosition();
  const resizeHandler = () => updateOverlayPosition();
  window.addEventListener('scroll', scrollHandler, true);
  window.addEventListener('resize', resizeHandler);

  setTimeout(() => {
    window.removeEventListener('scroll', scrollHandler, true);
    window.removeEventListener('resize', resizeHandler);
  }, 6000);

  return { found: true };
}
