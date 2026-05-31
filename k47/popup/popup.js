const selectedIds = new Set();

const btnCapture = document.getElementById('btnCapture');
const btnCompare = document.getElementById('btnCompare');
const snapshotList = document.getElementById('snapshotList');
const snapshotCount = document.getElementById('snapshotCount');
const statusBar = document.getElementById('statusBar');
const captureProgress = document.getElementById('captureProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

let statusTimeout = null;

function showStatus(msg, type = 'info') {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
  statusTimeout = setTimeout(() => {
    statusBar.classList.add('hidden');
  }, 4000);
}

function showProgress(percent, text) {
  captureProgress.classList.remove('hidden');
  progressFill.style.width = percent + '%';
  progressText.textContent = text;
}

function hideProgress() {
  captureProgress.classList.add('hidden');
  progressFill.style.width = '0%';
}

function updateCompareButton() {
  btnCompare.disabled = selectedIds.size !== 2;
}

function formatNodeCount(count) {
  if (count >= 10000) return (count / 1000).toFixed(1) + 'k';
  return String(count);
}

function renderSnapshotList(snapshots) {
  snapshotCount.textContent = snapshots.length;

  if (snapshots.length === 0) {
    snapshotList.innerHTML = '<div class="empty-state">暂无快照，点击"捕获快照"开始</div>';
    return;
  }

  snapshotList.innerHTML = '';
  snapshots.forEach((snap) => {
    const item = document.createElement('div');
    item.className = 'snapshot-item' + (selectedIds.has(snap.id) ? ' selected' : '');
    item.dataset.id = snap.id;

    const date = new Date(snap.timestamp);
    const timeStr = date.toLocaleString('zh-CN');

    const truncationHtml = snap.truncated
      ? `<span class="truncation-badge" title="DOM节点过多，快照已截断。已捕获 ${snap.nodeCount}/${snap.totalDomNodes} 个节点">⚠️ 截断</span>`
      : '';

    const nodeCountHtml = snap.nodeCount
      ? `<span class="node-count">${formatNodeCount(snap.nodeCount)} 节点</span>`
      : '';

    item.innerHTML = `
      <div class="checkbox"></div>
      <div class="snapshot-info">
        <div class="snapshot-name" title="双击重命名">${escapeHtml(snap.name)}</div>
        <div class="snapshot-meta">
          <span>${escapeHtml(snap.url || 'N/A')} · ${timeStr}</span>
          ${nodeCountHtml}
          ${truncationHtml}
        </div>
      </div>
      <div class="snapshot-actions">
        <button class="btn-icon-small rename" title="重命名">✏️</button>
        <button class="btn-icon-small delete" title="删除">🗑️</button>
      </div>
    `;

    item.querySelector('.checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelect(snap.id, item);
    });

    item.querySelector('.snapshot-info').addEventListener('click', (e) => {
      if (e.target.classList.contains('snapshot-name')) return;
      toggleSelect(snap.id, item);
    });

    const nameEl = item.querySelector('.snapshot-name');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(snap.id, nameEl);
    });

    item.querySelector('.rename').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(snap.id, nameEl);
    });

    item.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSnapshot(snap.id);
    });

    snapshotList.appendChild(item);
  });
}

function toggleSelect(id, itemEl) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    itemEl.classList.remove('selected');
  } else {
    if (selectedIds.size >= 2) {
      const oldId = selectedIds.values().next().value;
      selectedIds.delete(oldId);
      const oldEl = snapshotList.querySelector(`[data-id="${oldId}"]`);
      if (oldEl) oldEl.classList.remove('selected');
    }
    selectedIds.add(id);
    itemEl.classList.add('selected');
  }
  updateCompareButton();
}

function startRename(id, nameEl) {
  nameEl.contentEditable = 'true';
  nameEl.focus();

  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = async () => {
    nameEl.contentEditable = 'false';
    const newName = nameEl.textContent.trim();
    if (newName) {
      try {
        await sendMessage({ type: 'RENAME_SNAPSHOT', id, name: newName });
      } catch (err) {
        showStatus('重命名失败: ' + err.message, 'error');
      }
    }
    loadSnapshots();
  };

  nameEl.addEventListener('blur', finish, { once: true });
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    }
    if (e.key === 'Escape') {
      nameEl.contentEditable = 'false';
      loadSnapshots();
    }
  });
}

async function deleteSnapshot(id) {
  if (!confirm('确定删除此快照？')) return;
  try {
    await sendMessage({ type: 'DELETE_SNAPSHOT', id });
    selectedIds.delete(id);
    updateCompareButton();
    showStatus('快照已删除', 'success');
    loadSnapshots();
  } catch (err) {
    showStatus('删除失败: ' + err.message, 'error');
  }
}

async function loadSnapshots() {
  try {
    const snapshots = await sendMessage({ type: 'GET_ALL_SNAPSHOTS' });
    renderSnapshotList(snapshots);
  } catch (err) {
    showStatus('加载失败: ' + err.message, 'error');
  }
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

btnCapture.addEventListener('click', async () => {
  btnCapture.disabled = true;
  showStatus('正在分析页面DOM大小...', 'info');
  showProgress(5, '估算页面节点数...');

  try {
    let estimateResult;
    try {
      estimateResult = await sendMessage({ type: 'ESTIMATE_DOM_SIZE' });
    } catch (_) {
      estimateResult = null;
    }

    const totalNodes = estimateResult ? estimateResult.totalDomNodes : 0;
    const isLargePage = totalNodes > 3000;

    showProgress(15, `页面约 ${formatNodeCount(totalNodes)} 个节点，开始捕获...`);
    showStatus(isLargePage
      ? `检测到大页面（${formatNodeCount(totalNodes)} 节点），使用异步分块捕获...`
      : '正在捕获DOM快照...', 'info');

    const captureOptions = {};
    if (isLargePage) {
      captureOptions.maxNodes = 5000;
      captureOptions.maxDepth = 20;
      captureOptions.yieldInterval = 150;
      captureOptions.skipHidden = true;
      captureOptions.useAsync = true;
    }

    const captureResult = await sendMessage({ type: 'CAPTURE_DOM', options: captureOptions });

    showProgress(80, '保存快照...');

    if (captureResult.error) throw new Error(captureResult.error);

    const saveResult = await sendMessage({
      type: 'SAVE_SNAPSHOT',
      data: {
        name: `Snapshot ${new Date().toLocaleString('zh-CN')}`,
        url: captureResult.url || '',
        domTree: captureResult.domTree,
        nodeCount: captureResult.nodeCount || 0,
        totalDomNodes: captureResult.totalDomNodes || 0,
        truncated: captureResult.truncated || false,
      },
    });

    if (saveResult && saveResult.error) throw new Error(saveResult.error);

    showProgress(100, '完成！');

    if (captureResult.truncated) {
      showStatus(
        `快照已保存（截断）：捕获 ${captureResult.nodeCount}/${captureResult.totalDomNodes} 个节点`,
        'error'
      );
    } else {
      showStatus(
        `快照捕获成功！共 ${captureResult.nodeCount || 0} 个节点`,
        'success'
      );
    }

    loadSnapshots();
  } catch (err) {
    showStatus('捕获失败: ' + err.message, 'error');
  } finally {
    btnCapture.disabled = false;
    setTimeout(hideProgress, 1500);
  }
});

btnCompare.addEventListener('click', async () => {
  if (selectedIds.size !== 2) return;

  const [idA, idB] = [...selectedIds];
  btnCompare.disabled = true;
  showStatus('正在对比快照...', 'info');

  try {
    const result = await sendMessage({
      type: 'COMPARE_SNAPSHOTS',
      idA,
      idB,
    });

    if (result && result.error) throw new Error(result.error);

    const diffData = {
      diffs: result.diffs,
      snapshotA: result.snapshotA,
      snapshotB: result.snapshotB,
    };

    chrome.storage.local.set({ diffData }, () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('diff/diff.html'),
      });
    });
  } catch (err) {
    showStatus('对比失败: ' + err.message, 'error');
  } finally {
    btnCompare.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', loadSnapshots);
