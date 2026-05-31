(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentTaskId = null;
  let pollTimer = null;

  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $(`#tab-${tab}`).classList.add('active');
    });
  });

  $$('.auth-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.auth-tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.auth-tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.authTab;
      $(`#auth-${tab}`).classList.add('active');
    });
  });

  $('#btn-parse').addEventListener('click', async () => {
    const formData = new FormData();
    const fileInput = $('#spec-file');
    const textInput = $('#spec-text');

    if (fileInput.files.length > 0) {
      formData.append('spec_file', fileInput.files[0]);
    } else if (textInput.value.trim()) {
      formData.append('spec_text', textInput.value.trim());
    } else {
      alert('请上传规范文件或粘贴规范内容');
      return;
    }

    formData.append('spec_format', $('#spec-format').value);

    try {
      $('#btn-parse').disabled = true;
      $('#btn-parse').textContent = '解析中...';

      const resp = await fetch('/api/parse-spec', { method: 'POST', body: formData });
      const data = await resp.json();

      if (!resp.ok) {
        alert('解析失败: ' + (data.detail || '未知错误'));
        return;
      }

      if (data.base_url && !$('#base-url').value) {
        $('#base-url').value = data.base_url;
      }

      renderEndpoints(data.endpoints);
      $('#endpoints-section').style.display = 'block';
      $('#btn-start').disabled = false;
    } catch (e) {
      alert('请求失败: ' + e.message);
    } finally {
      $('#btn-parse').disabled = false;
      $('#btn-parse').textContent = '解析规范';
    }
  });

  function renderEndpoints(endpoints) {
    const container = $('#endpoints-list');
    $('#ep-count').textContent = endpoints.length;
    container.innerHTML = endpoints
      .map(
        (ep) => `
      <div class="ep-item">
        <span class="ep-method ${ep.method.toLowerCase()}">${ep.method}</span>
        <span class="ep-path">${escapeHtml(ep.path)}</span>
        <span class="ep-summary">${escapeHtml(ep.summary || '')}</span>
      </div>
    `
      )
      .join('');
  }

  $('#btn-start').addEventListener('click', async () => {
    if (!$('#base-url').value) {
      alert('请输入目标 Base URL');
      return;
    }

    const vulnChecks = $$('.checkbox-group input[type=checkbox]:checked');
    const vulnTypes = Array.from(vulnChecks)
      .map((c) => c.value)
      .join(',');

    const formData = new FormData();
    const fileInput = $('#spec-file');
    const textInput = $('#spec-text');

    if (fileInput.files.length > 0) {
      formData.append('spec_file', fileInput.files[0]);
    } else if (textInput.value.trim()) {
      formData.append('spec_text', textInput.value.trim());
    }

    formData.append('base_url', $('#base-url').value);
    formData.append('concurrency', $('#concurrency').value);
    formData.append('delay_ms', $('#delay-ms').value);
    formData.append('timeout', $('#timeout').value);
    formData.append('vuln_types', vulnTypes);
    formData.append('headers', $('#custom-headers').value);
    formData.append('bearer_token', $('#bearer-token').value);
    formData.append('cookie', $('#cookie-value').value);
    formData.append('api_key_header', $('#api-key-header').value);
    formData.append('api_key_value', $('#api-key-value').value);
    formData.append('spec_format', $('#spec-format').value);

    try {
      $('#btn-start').disabled = true;
      $('#btn-stop').style.display = 'inline-block';

      const resp = await fetch('/api/start-fuzz', { method: 'POST', body: formData });
      const data = await resp.json();

      if (!resp.ok) {
        alert('启动失败: ' + (data.detail || '未知错误'));
        $('#btn-start').disabled = false;
        $('#btn-stop').style.display = 'none';
        return;
      }

      currentTaskId = data.task_id;
      $('#progress-section').style.display = 'block';
      $('#results-section').style.display = 'none';

      startPolling();
    } catch (e) {
      alert('请求失败: ' + e.message);
      $('#btn-start').disabled = false;
      $('#btn-stop').style.display = 'none';
    }
  });

  $('#btn-stop').addEventListener('click', async () => {
    if (!currentTaskId) return;
    try {
      await fetch(`/api/stop-fuzz/${currentTaskId}`, { method: 'POST' });
    } catch (e) {}
    stopPolling();
    $('#btn-stop').style.display = 'none';
    $('#btn-start').disabled = false;
  });

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollStatus, 1500);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollStatus() {
    if (!currentTaskId) return;
    try {
      const resp = await fetch(`/api/fuzz-status/${currentTaskId}`);
      const data = await resp.json();

      if (data.status === 'running') {
        const pct = Math.round(data.progress * 100);
        $('#progress-bar').style.width = pct + '%';
        $('#progress-text').textContent = `${data.message} (${pct}%)`;
      } else if (data.status === 'completed') {
        stopPolling();
        $('#progress-bar').style.width = '100%';
        $('#progress-text').textContent = '测试完成!';
        $('#btn-stop').style.display = 'none';
        $('#btn-start').disabled = false;
        renderResults(data.report);
      } else {
        stopPolling();
        $('#progress-text').textContent = '任务未找到';
        $('#btn-stop').style.display = 'none';
        $('#btn-start').disabled = false;
      }
    } catch (e) {}
  }

  function renderResults(report) {
    $('#results-section').style.display = 'block';

    let warningHtml = '';
    if (report.auth_warning) {
      warningHtml = `<div class="auth-warning"><strong>⚠️ 认证警告</strong>${escapeHtml(report.auth_warning)}</div>`;
    }

    const severities = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    (report.findings || []).forEach((f) => {
      if (severities[f.severity] !== undefined) severities[f.severity]++;
    });

    $('#summary-cards').innerHTML = `
      ${warningHtml}
      <div class="summary-card"><div class="num">${report.total_endpoints}</div><div class="lbl">端点</div></div>
      <div class="summary-card"><div class="num">${report.total_requests}</div><div class="lbl">请求</div></div>
      <div class="summary-card critical"><div class="num">${severities.critical}</div><div class="lbl">Critical</div></div>
      <div class="summary-card high"><div class="num">${severities.high}</div><div class="lbl">High</div></div>
      <div class="summary-card medium"><div class="num">${severities.medium}</div><div class="lbl">Medium</div></div>
      <div class="summary-card low"><div class="num">${severities.low}</div><div class="lbl">Low</div></div>
    `;

    const tbody = $('#findings-body');
    tbody.innerHTML = (report.findings || [])
      .map(
        (f, i) => {
          let payloadHtml = `<code>${escapeHtml((f.payload || '').substring(0, 60))}</code>`;
          if (f.minimal_payload && f.minimal_payload !== f.payload) {
            payloadHtml += `<br><span class="minimal-badge">→ 最小: <code>${escapeHtml(f.minimal_payload.substring(0, 60))}</code></span>`;
          }

          let curlHtml = '';
          if (f.curl_command) {
            const curlId = `curl-${i}`;
            curlHtml = `<button class="btn-copy" onclick="copyCurl('${curlId}')">复制</button><code id="${curlId}" class="curl-code">${escapeHtml(f.curl_command.substring(0, 200))}</code>`;
          }

          return `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge badge-${vulnBadge(f.vuln_type)}">${f.vuln_type.replace('_', ' ').toUpperCase()}</span></td>
            <td><span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span></td>
            <td><code>${escapeHtml(f.method)} ${escapeHtml(f.endpoint)}</code></td>
            <td>${escapeHtml(f.test_name)}</td>
            <td>${payloadHtml}</td>
            <td>${f.response_status}</td>
            <td>${escapeHtml(f.evidence)}</td>
            <td>${curlHtml}</td>
          </tr>`;
        }
      )
      .join('');
  }

  window.copyCurl = function(id) {
    const el = document.getElementById(id);
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = el.previousElementSibling;
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '已复制!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      });
    }
  };

  function vulnBadge(type) {
    const map = { sql_injection: 'sql', xss: 'xss', idor: 'idor', param_pollution: 'param' };
    return map[type] || 'info';
  }

  $('#btn-download-json').addEventListener('click', async () => {
    if (!currentTaskId) return;
    const resp = await fetch(`/api/fuzz-report/${currentTaskId}?format=json`);
    const data = await resp.json();
    downloadFile(JSON.stringify(data, null, 2), 'fuzz-report.json', 'application/json');
  });

  $('#btn-download-html').addEventListener('click', async () => {
    if (!currentTaskId) return;
    const resp = await fetch(`/api/fuzz-report/${currentTaskId}?format=html`);
    const html = await resp.text();
    downloadFile(html, 'fuzz-report.html', 'text/html');
  });

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
