let diffData = null;
let currentFilter = 'all';
const PAGE_SIZE = 200;
let renderedCount = 0;
let filteredDiffs = [];
let allGroupedDiffs = [];

function showReplayStatus(msg, type = 'info') {
  const statusEl = document.getElementById('replayStatus');
  statusEl.textContent = msg;
  statusEl.className = `replay-status replay-${type}`;
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('diffData', (result) => {
    diffData = result.diffData;
    if (!diffData || !diffData.diffs) {
      document.getElementById('diffTree').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">未找到对比数据</div></div>';
      return;
    }
    initDiffPage();
  });
});

function initDiffPage() {
  const { diffs, snapshotA, snapshotB } = diffData;

  document.getElementById('snapAName').textContent = snapshotA.name;
  document.getElementById('snapAUrl').textContent = snapshotA.url || '';
  document.getElementById('snapBName').textContent = snapshotB.name;
  document.getElementById('snapBUrl').textContent = snapshotB.url || '';

  const metaA = document.getElementById('snapAMeta');
  const metaB = document.getElementById('snapBMeta');

  if (snapshotA.nodeCount) {
    metaA.innerHTML = `${snapshotA.nodeCount} 节点${snapshotA.truncated ? ' <span class="truncation-flag">⚠️ 截断</span>' : ''}`;
  }
  if (snapshotB.nodeCount) {
    metaB.innerHTML = `${snapshotB.nodeCount} 节点${snapshotB.truncated ? ' <span class="truncation-flag">⚠️ 截断</span>' : ''}`;
  }

  if (snapshotA.truncated || snapshotB.truncated) {
    document.getElementById('truncationWarning').classList.remove('hidden');
  }

  const added = diffs.filter(d => d.type === 'added').length;
  const removed = diffs.filter(d => d.type === 'removed').length;
  const modified = diffs.filter(d => d.type === 'modified').length;

  document.getElementById('diffSummary').innerHTML =
    `<span class="added">+${added} 新增</span> <span class="removed">-${removed} 删除</span> <span class="modified">~${modified} 修改</span>`;

  if (diffs.length === 0) {
    document.getElementById('emptyDiff').classList.remove('hidden');
    document.getElementById('diffTree').classList.add('hidden');
    return;
  }

  allGroupedDiffs = groupDiffsByPath(diffs);
  filteredDiffs = allGroupedDiffs;
  renderedCount = 0;

  renderNextPage();
  setupFilters();
  setupToolbar();
  setupLoadMore();
}

function renderNextPage() {
  const container = document.getElementById('diffTree');
  const end = Math.min(renderedCount + PAGE_SIZE, filteredDiffs.length);

  for (let i = renderedCount; i < end; i++) {
    const item = createDiffItem(filteredDiffs[i]);
    container.appendChild(item);
  }

  renderedCount = end;
  updateLoadMoreButton();
}

function updateLoadMoreButton() {
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  const loadMoreInfo = document.getElementById('loadMoreInfo');

  if (renderedCount < filteredDiffs.length) {
    loadMoreContainer.classList.remove('hidden');
    loadMoreInfo.textContent = `已显示 ${renderedCount} / ${filteredDiffs.length} 项`;
  } else {
    loadMoreContainer.classList.add('hidden');
  }
}

function setupLoadMore() {
  document.getElementById('btnLoadMore').addEventListener('click', renderNextPage);
}

function rerenderWithFilter() {
  const container = document.getElementById('diffTree');
  container.innerHTML = '';
  renderedCount = 0;

  if (currentFilter === 'all') {
    filteredDiffs = allGroupedDiffs;
  } else {
    filteredDiffs = allGroupedDiffs.filter(d => d.type === currentFilter);
  }

  if (filteredDiffs.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-text">当前筛选条件下无差异项</div></div>';
    document.getElementById('loadMoreContainer').classList.add('hidden');
    return;
  }

  renderNextPage();
}

function groupDiffsByPath(diffs) {
  const pathMap = new Map();

  diffs.forEach((diff) => {
    const key = diff.path || '';
    if (!pathMap.has(key)) {
      pathMap.set(key, []);
    }
    pathMap.get(key).push(diff);
  });

  const result = [];
  for (const [path, groupDiffs] of pathMap) {
    if (groupDiffs.length === 1) {
      result.push(groupDiffs[0]);
    } else {
      const merged = {
        type: 'modified',
        path,
        attributeChanges: {},
        styleChanges: {},
        subDiffs: groupDiffs,
      };
      groupDiffs.forEach(d => {
        if (d.type === 'added') merged.hasAdded = true;
        if (d.type === 'removed') merged.hasRemoved = true;
        if (d.type === 'modified') {
          merged.hasModified = true;
          Object.assign(merged.attributeChanges, d.attributeChanges || {});
          Object.assign(merged.styleChanges, d.styleChanges || {});
        }
      });
      result.push(merged);
    }
  }

  return result;
}

function createDiffItem(diff) {
  const item = document.createElement('div');
  item.className = `diff-item type-${diff.type}`;
  item.dataset.type = diff.type;

  const header = document.createElement('div');
  header.className = 'diff-header';

  const toggle = document.createElement('span');
  toggle.className = 'diff-toggle collapsed';
  toggle.textContent = '▼';

  const badge = document.createElement('span');
  badge.className = `diff-type-badge ${diff.type}`;
  badge.textContent = typeLabel(diff.type);

  const tag = document.createElement('span');
  tag.className = 'diff-tag';
  const tagName = diff.tagName || (diff.node ? diff.node.tagName : '');
  if (diff.type === 'added') {
    tag.textContent = tagName ? `<${tagName.toLowerCase()}>` : '';
  } else if (diff.type === 'removed') {
    tag.textContent = tagName ? `<${tagName.toLowerCase()}>` : '';
  } else if (diff.type === 'modified') {
    tag.textContent = tagName ? `<${tagName.toLowerCase()}>` : '';
  }

  const path = document.createElement('span');
  path.className = 'diff-path';
  path.textContent = diff.path || '';
  path.title = diff.path || '';

  const locateBtn = document.createElement('button');
  locateBtn.className = 'btn-locate';
  locateBtn.innerHTML = '🎯';
  locateBtn.title = '在页面中定位此元素';
  locateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      showReplayStatus('正在定位元素...', 'info');
      const targetSnapshot = diff.type === 'added' || diff.type === 'modified' ? diffData.snapshotB : diffData.snapshotA;
      const result = await sendMessage({
        type: 'LOCATE_ELEMENT',
        xpath: diff.path || '',
        targetUrl: targetSnapshot.url || '',
        diffType: diff.type,
      });
      if (result && result.found) {
        showReplayStatus('✓ 已定位并高亮元素', 'success');
      } else if (result && result.error) {
        showReplayStatus('定位失败: ' + result.error, 'error');
      } else {
        showReplayStatus('未找到元素，可能页面结构已变化', 'error');
      }
    } catch (err) {
      showReplayStatus('定位失败: ' + err.message, 'error');
    }
  });

  header.appendChild(toggle);
  header.appendChild(badge);
  header.appendChild(tag);
  header.appendChild(path);
  header.appendChild(locateBtn);

  const body = document.createElement('div');
  body.className = 'diff-body';

  if (diff.type === 'added') {
    body.appendChild(createNodePreview(diff, '新增节点'));
  } else if (diff.type === 'removed') {
    body.appendChild(createNodePreview(diff, '删除节点'));
  } else if (diff.type === 'modified') {
    if (Object.keys(diff.attributeChanges || {}).length > 0) {
      body.appendChild(createAttrChangeTable(diff.attributeChanges));
    }
    if (Object.keys(diff.styleChanges || {}).length > 0) {
      body.appendChild(createStyleChangeTable(diff.styleChanges));
    }
  }

  header.addEventListener('click', () => {
    const isOpen = body.classList.contains('open');
    if (isOpen) {
      body.classList.remove('open');
      toggle.classList.add('collapsed');
    } else {
      body.classList.add('open');
      toggle.classList.remove('collapsed');
    }
  });

  item.appendChild(header);
  item.appendChild(body);

  return item;
}

function typeLabel(type) {
  switch (type) {
    case 'added': return '新增';
    case 'removed': return '删除';
    case 'modified': return '修改';
    default: return type;
  }
}

function createNodePreview(diff, label) {
  const section = document.createElement('div');
  section.className = 'change-section';

  const title = document.createElement('div');
  title.className = 'change-section-title';
  title.textContent = label;
  section.appendChild(title);

  const preview = document.createElement('div');
  preview.className = 'node-preview';

  const tagName = diff.tagName || (diff.node ? diff.node.tagName : 'UNKNOWN');
  const nodeId = diff.id || (diff.node ? diff.node.id : '');
  const nodeClass = diff.className || (diff.node ? diff.node.className : '');

  let html = `&lt;<span class="attr">${escapeHtml(tagName.toLowerCase())}</span>`;
  if (nodeId) html += ` <span class="attr">id</span>="<span class="val">${escapeHtml(nodeId)}</span>"`;
  if (nodeClass) html += ` <span class="attr">class</span>="<span class="val">${escapeHtml(nodeClass)}</span>"`;
  html += '&gt;';
  preview.innerHTML = html;

  section.appendChild(preview);

  return section;
}

function createAttrChangeTable(changes) {
  const section = document.createElement('div');
  section.className = 'change-section';

  const title = document.createElement('div');
  title.className = 'change-section-title';
  title.textContent = '属性变化';
  section.appendChild(title);

  const table = document.createElement('table');
  table.className = 'change-table';
  table.innerHTML = '<tr><th>属性</th><th>旧值</th><th>新值</th></tr>';

  for (const [key, change] of Object.entries(changes)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(key)}</td><td class="old-val">${escapeHtml(change.old || '(无)')}</td><td class="new-val">${escapeHtml(change.new || '(无)')}</td>`;
    table.appendChild(tr);
  }

  section.appendChild(table);
  return section;
}

function createStyleChangeTable(changes) {
  const section = document.createElement('div');
  section.className = 'change-section';

  const title = document.createElement('div');
  title.className = 'change-section-title';
  title.textContent = '样式变化';
  section.appendChild(title);

  const table = document.createElement('table');
  table.className = 'change-table';
  table.innerHTML = '<tr><th>样式属性</th><th>旧值</th><th>新值</th></tr>';

  for (const [key, change] of Object.entries(changes)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(key)}</td><td class="old-val">${escapeHtml(change.old || '(无)')}</td><td class="new-val">${escapeHtml(change.new || '(无)')}</td>`;
    table.appendChild(tr);
  }

  section.appendChild(table);
  return section;
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      rerenderWithFilter();
    });
  });
}

function setupToolbar() {
  document.getElementById('btnExpandAll').addEventListener('click', () => {
    document.querySelectorAll('.diff-body').forEach(body => body.classList.add('open'));
    document.querySelectorAll('.diff-toggle').forEach(t => t.classList.remove('collapsed'));
  });

  document.getElementById('btnCollapseAll').addEventListener('click', () => {
    document.querySelectorAll('.diff-body').forEach(body => body.classList.remove('open'));
    document.querySelectorAll('.diff-toggle').forEach(t => t.classList.add('collapsed'));
  });

  document.getElementById('btnExport').addEventListener('click', exportReport);
}

function exportReport() {
  if (!diffData) return;

  const { diffs, snapshotA, snapshotB } = diffData;
  const added = diffs.filter(d => d.type === 'added').length;
  const removed = diffs.filter(d => d.type === 'removed').length;
  const modified = diffs.filter(d => d.type === 'modified').length;

  const truncNote = (snapshotA.truncated || snapshotB.truncated)
    ? '<div style="background:#fff3cd;color:#856404;padding:10px 16px;border-radius:6px;margin-bottom:16px">⚠️ 一个或多个快照已被截断，对比结果可能不完整</div>'
    : '';

  let diffRows = '';
  const exportLimit = Math.min(diffs.length, 2000);
  for (let idx = 0; idx < exportLimit; idx++) {
    const diff = diffs[idx];
    const typeColor = diff.type === 'added' ? '#27ae60' : diff.type === 'removed' ? '#e74c3c' : '#f39c12';
    const typeText = typeLabel(diff.type);
    const tagName = diff.tagName || (diff.node ? diff.node.tagName : '');

    let detailRows = '';

    if (diff.type === 'modified') {
      const attrChanges = diff.attributeChanges || {};
      for (const [key, change] of Object.entries(attrChanges)) {
        detailRows += `<tr><td>${escapeHtml(key)}</td><td style="color:#e74c3c;text-decoration:line-through">${escapeHtml(change.old || '')}</td><td style="color:#27ae60">${escapeHtml(change.new || '')}</td></tr>`;
      }
      const styleChanges = diff.styleChanges || {};
      for (const [key, change] of Object.entries(styleChanges)) {
        detailRows += `<tr><td>${escapeHtml(key)}</td><td style="color:#e74c3c;text-decoration:line-through">${escapeHtml(change.old || '')}</td><td style="color:#27ae60">${escapeHtml(change.new || '')}</td></tr>`;
      }
    } else {
      const nodeId = diff.id || (diff.node ? diff.node.id : '');
      const nodeClass = diff.className || (diff.node ? diff.node.className : '');
      detailRows += `<tr><td>tagName</td><td colspan="2">&lt;${escapeHtml(tagName.toLowerCase())}&gt; id="${escapeHtml(nodeId || '')}" class="${escapeHtml(nodeClass || '')}"</td></tr>`;
    }

    diffRows += `
      <tr style="border-left:4px solid ${typeColor}">
        <td><span style="background:${typeColor};color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:bold">${typeText}</span></td>
        <td><code>${escapeHtml(tagName)}</code></td>
        <td><code style="font-size:11px;word-break:break-all">${escapeHtml(diff.path || '')}</code></td>
        <td>
          ${detailRows ? `<table style="width:100%;border-collapse:collapse;font-size:12px"><tr><th style="text-align:left;padding:2px 8px;background:#f8f9fa">属性</th><th style="text-align:left;padding:2px 8px;background:#f8f9fa">旧值</th><th style="text-align:left;padding:2px 8px;background:#f8f9fa">新值</th></tr>${detailRows}</table>` : ''}
        </td>
      </tr>`;
  }

  const truncExportNote = diffs.length > exportLimit
    ? `<div style="text-align:center;color:#b2bec3;font-size:12px;margin-top:12px">报告仅显示前 ${exportLimit} 条差异（共 ${diffs.length} 条）</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>DOM Diff Report</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a2e;background:#f5f7fb;margin:0;padding:24px}
h1{font-size:24px;margin-bottom:4px}
.summary{margin:12px 0 24px;font-size:14px;color:#636e72}
.summary span{font-weight:700;margin-right:16px}
.snapshot-info{display:flex;gap:24px;margin-bottom:24px}
.snapshot-card{flex:1;padding:12px 16px;background:#fff;border:1px solid #e0e6ed;border-radius:8px}
.snapshot-card h3{font-size:13px;color:#636e72;margin:0 0 4px;text-transform:uppercase}
.snapshot-card p{font-size:13px;margin:0;color:#2d3436;font-weight:600}
.snapshot-card .url{font-size:11px;color:#b2bec3;font-weight:400;word-break:break-all}
.snapshot-card .meta{font-size:11px;color:#b2bec3;margin-top:2px}
table.main{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
table.main th{background:#f8f9fa;padding:10px 14px;text-align:left;font-weight:700;color:#636e72;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e0e6ed}
table.main td{padding:10px 14px;border-bottom:1px solid #f0f3f5;vertical-align:top}
code{background:#f0f3f5;padding:2px 6px;border-radius:3px;font-size:12px}
.timestamp{margin-top:24px;font-size:11px;color:#b2bec3;text-align:center}
</style>
</head>
<body>
<h1>DOM 对比报告</h1>
<div class="summary">
  <span style="color:#27ae60">+${added} 新增</span>
  <span style="color:#e74c3c">-${removed} 删除</span>
  <span style="color:#f39c12">~${modified} 修改</span>
</div>
${truncNote}
<div class="snapshot-info">
  <div class="snapshot-card">
    <h3>快照 A</h3>
    <p>${escapeHtml(snapshotA.name)}</p>
    <div class="url">${escapeHtml(snapshotA.url || '')}</div>
    ${snapshotA.nodeCount ? `<div class="meta">${snapshotA.nodeCount} 节点${snapshotA.truncated ? ' ⚠️ 截断' : ''}</div>` : ''}
  </div>
  <div class="snapshot-card">
    <h3>快照 B</h3>
    <p>${escapeHtml(snapshotB.name)}</p>
    <div class="url">${escapeHtml(snapshotB.url || '')}</div>
    ${snapshotB.nodeCount ? `<div class="meta">${snapshotB.nodeCount} 节点${snapshotB.truncated ? ' ⚠️ 截断' : ''}</div>` : ''}
  </div>
</div>
<table class="main">
  <tr><th>类型</th><th>元素</th><th>XPath</th><th>详情</th></tr>
  ${diffRows}
</table>
${truncExportNote}
<div class="timestamp">报告生成于 ${new Date().toLocaleString('zh-CN')}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dom-diff-report-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
