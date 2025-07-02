const STORAGE_KEYS = {
  MY_KEY: 'emberchat-my-key',
  INBOX: 'emberchat-inbox',
  OUTBOX: 'emberchat-outbox'
};

let peer = null;
let myKey = '';
let myEncryptionKey = '';
let outbox = {};
let inbox = []; // [{from, msg, ts, read}]
let activeThread = null;

function saveData() {
  localStorage.setItem(STORAGE_KEYS.MY_KEY, myKey);
  localStorage.setItem(STORAGE_KEYS.INBOX, JSON.stringify(inbox));
  localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(outbox));
}

function loadData() {
  myKey = localStorage.getItem(STORAGE_KEYS.MY_KEY) || '';
  inbox = JSON.parse(localStorage.getItem(STORAGE_KEYS.INBOX) || '[]');
  outbox = JSON.parse(localStorage.getItem(STORAGE_KEYS.OUTBOX) || '{}');
  if (myKey) {
    document.getElementById('myAccessKey').value = myKey;
    const parts = myKey.split('-');
    myEncryptionKey = atob(parts[2]);
    initPeer(parts[1]);
  }
  renderThreads();
  renderChat();
}

function generateKey() {
  const key = crypto.randomUUID().slice(0, 8);
  myEncryptionKey = crypto.randomUUID().slice(0, 16);
  myKey = `EMBER-${key}-${btoa(myEncryptionKey)}`;
  document.getElementById('myAccessKey').value = myKey;
  initPeer(key);
  saveData();
}

function initPeer(id) {
  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on('connection', conn => {
    conn.on('data', data => {
      if (data.encrypted && data.from) {
        const msg = decrypt(data.encrypted, myEncryptionKey);
        inbox.push({ from: data.from, msg, ts: Date.now(), read: false });
        saveData();
        renderThreads();
        renderChat();
      }
    });
  });
}

function sendMessage() {
  const raw = document.getElementById('msgInput').value.trim();
  if (!activeThread || !raw) return alert("Select a contact and type a message.");

  const parts = activeThread.split('-');
  if (parts.length !== 3) return alert("Invalid key format.");
  const peerId = parts[1];
  const encKey = atob(parts[2]);

  const encrypted = encrypt(raw, encKey);
  const conn = peer.connect(peerId);
  const payload = { encrypted, from: myKey };

  conn.on('open', () => {
    conn.send(payload);
    console.log("✅ Sent to", peerId);
    if (!inbox.some(m => m.from === activeThread && m.msg === raw)) {
      inbox.push({ from: activeThread, msg: raw, ts: Date.now(), read: true });
    }
    document.getElementById('msgInput').value = '';
    saveData();
    renderChat();
    renderThreads();
  });

  conn.on('error', () => {
    if (!outbox[peerId]) outbox[peerId] = [];
    outbox[peerId].push(payload);
    console.log("📨 Queued for", peerId);
    saveData();
    renderThreads();
  });
}

function encrypt(text, key) {
  return btoa([...text].map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join(""));
}

function decrypt(enc, key) {
  return [...atob(enc)].map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join("");
}

function renderThreads() {
  const list = document.getElementById('threadList');
  list.innerHTML = '';
  const grouped = inbox.reduce((acc, m) => {
    if (!acc[m.from]) acc[m.from] = [];
    acc[m.from].push(m);
    return acc;
  }, {});

  const sorted = Object.entries(grouped).sort((a, b) => {
    const lastA = a[1][a[1].length - 1].ts;
    const lastB = b[1][b[1].length - 1].ts;
    return lastB - lastA;
  });

  for (const [sender, msgs] of sorted) {
    const unread = msgs.some(m => !m.read);
    const btn = document.createElement('div');
    btn.className = 'threadButton';
    if (unread) btn.classList.add('unread');
    btn.textContent = sender;
    btn.onclick = () => {
      activeThread = sender;
      msgs.forEach(m => m.read = true);
      saveData();
      renderChat();
      renderThreads();
    };
    list.appendChild(btn);
  }
}

function renderChat() {
  const view = document.getElementById('chatView');
  const target = document.getElementById('chatTarget');
  const box = document.getElementById('chatBox');

  if (!activeThread) {
    target.textContent = 'No thread selected';
    box.innerHTML = '';
    return;
  }

  target.textContent = activeThread;
  const msgs = inbox.filter(m => m.from === activeThread);
  box.innerHTML = msgs.map(m => `<div>${m.read ? '🟢' : '🔵'} ${m.msg}</div>`).join('');
}

window.onload = loadData;
window.generateKey = generateKey;
window.sendMessage = sendMessage;
