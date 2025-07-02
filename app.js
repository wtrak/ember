const STORAGE_KEYS = {
  MY_KEY: 'emberchat-my-key',
  CONTACTS: 'emberchat-contacts',
  THREADS: 'emberchat-threads'
};

let peer = null;
let myKey = '';
let myEncryptionKey = '';
let contacts = {}; // { peerId: { name, fullKey, unreadCount } }
let threads = {}; // { peerId: [ { msg, from, ts } ] }
let currentPeer = '';

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.MY_KEY, myKey);
  localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
  localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
}

function loadAll() {
  myKey = localStorage.getItem(STORAGE_KEYS.MY_KEY) || '';
  contacts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTACTS) || '{}');
  threads = JSON.parse(localStorage.getItem(STORAGE_KEYS.THREADS) || '{}');

  if (myKey) {
    document.getElementById('myAccessKey').value = myKey;
    const parts = myKey.split('-');
    myEncryptionKey = atob(parts[2]);
    initPeer(parts[1]);
  }

  renderContacts();
}

function generateKey() {
  const id = crypto.randomUUID().slice(0, 8);
  myEncryptionKey = crypto.randomUUID().slice(0, 16);
  myKey = `EMBER-${id}-${btoa(myEncryptionKey)}`;
  document.getElementById('myAccessKey').value = myKey;
  initPeer(id);
  saveAll();
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
        const parts = data.from.split('-');
        const peerId = parts[1];

        if (!contacts[peerId]) {
  contacts[peerId] = {
    name: peerId,
    fullKey: data.from,
    unreadCount: 0
  };
} else {
  contacts[peerId].fullKey = data.from; // overwrite with most recent full key
}


        if (!threads[peerId]) threads[peerId] = [];
        threads[peerId].push({ from: data.from, msg, ts: Date.now() });

        if (peerId !== currentPeer) contacts[peerId].unreadCount = (contacts[peerId].unreadCount || 0) + 1;

        saveAll();
        renderContacts();
        if (peerId === currentPeer) renderMessages();
      }
    });
  });
}

function addContact() {
  const key = document.getElementById('recipientKey').value.trim();
  const name = document.getElementById('contactName').value.trim();
  const parts = key.split('-');
  if (parts.length !== 3) return alert("Invalid key format");

  const peerId = parts[1];
  contacts[peerId] = { name, fullKey: key, unreadCount: 0 };
  if (!threads[peerId]) threads[peerId] = [];

  document.getElementById('recipientKey').value = '';
  document.getElementById('contactName').value = '';

  saveAll();
  renderContacts();
}


function selectContact(peerId) {
  currentPeer = peerId;
  contacts[peerId].unreadCount = 0;
  const header = document.getElementById('chatHeader');
header.innerHTML = `
  💬 Chat with ${contacts[peerId].name}
  <br><small>Key: ${contacts[peerId].fullKey || 'Unknown'}</small>
  <button onclick="navigator.clipboard.writeText('${contacts[peerId].fullKey || ''}')">📋 Copy Key</button>
`;

  renderContacts();
  renderMessages();
}

function renderContacts() {
  const container = document.getElementById('contactList');
  container.innerHTML = '';

  const sorted = Object.entries(contacts).sort((a, b) => {
    const tA = threads[a[0]]?.slice(-1)[0]?.ts || 0;
    const tB = threads[b[0]]?.slice(-1)[0]?.ts || 0;
    return tB - tA;
  });

  sorted.forEach(([peerId, info]) => {
    const btn = document.createElement('button');
    btn.textContent = `${info.name}${info.unreadCount ? ' 🔵' : ''}`;
    btn.onclick = () => selectContact(peerId);
    container.appendChild(btn);
    container.appendChild(document.createElement('br'));
  });
}

function sendMessage() {
  if (!currentPeer) return alert("Select a contact first");
  const raw = document.getElementById('chatInput').value.trim();
  if (!raw) return;

  const toKey = contacts[currentPeer].fullKey;
  const parts = toKey.split('-');
  const peerId = parts[1];
  const encKey = atob(parts[2]);

  const encrypted = encrypt(raw, encKey);
  const conn = peer.connect(peerId);
  const payload = { encrypted, from: myKey };

  conn.on('open', () => conn.send(payload));

  threads[peerId].push({ from: myKey, msg: raw, ts: Date.now() });
  document.getElementById('chatInput').value = '';
  saveAll();
  renderMessages();
}

function renderMessages() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';

  const msgs = threads[currentPeer] || [];
  msgs.forEach(m => {
    const p = document.createElement('p');
    const who = m.from === myKey ? '🟢 You:' : '🔵 Them:';
    p.textContent = `${who} ${m.msg}`;
    container.appendChild(p);
  });
}

function encrypt(text, key) {
  return btoa([...text].map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join(''));
}

function decrypt(enc, key) {
  return [...atob(enc)].map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
}

loadAll();
