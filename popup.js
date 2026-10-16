const statusEl = document.getElementById('status');
const startButton = document.getElementById('start');
const showButton = document.getElementById('show');

function setStatus(text, error = false) {
  statusEl.textContent = text;
  statusEl.style.color = error ? '#ff8d76' : '';
}

async function send(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\/(x\.com|twitter\.com)\//i.test(tab.url || '')) {
    setStatus('请先打开 x.com，并保持登录。', true);
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
    window.close();
  } catch {
    setStatus('页面还没准备好，请刷新 X 后重试。', true);
  }
}

startButton.addEventListener('click', () => send('START_SCAN'));
showButton.addEventListener('click', () => send('SHOW_PANEL'));

