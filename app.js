const STORAGE_KEYS = {
  MY_KEY: 'emberchat-my-key',
  INBOX: 'emberchat-inbox',
  OUTBOX: 'emberchat-outbox'
};

let peer = null;
let myKey = '';
let myEncryptionKey = '';
let outbox = {};
let inbox = [];

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
  renderMessages();
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
        inbox.push({ from: data.from, msg, ts: Date.now() });
        saveData();
        renderMessages();
      }
    });
  });
}

function sendMessage() {
  const toKey = document.getElementById('recipientKey').value.trim();
  const raw = document.getElementById('msgInput').value.trim();
  if (!toKey || !raw) return alert("Fill in all fields.");

  const parts = toKey.split('-');
  if (parts.length !== 3) return alert("Invalid key format.");
  const peerId = parts[1];
  const encKey = atob(parts[2]);

  const encrypted = encrypt(raw, encKey);
  const conn = peer.connect(peerId);

  const payload = { encrypted, from: myKey };

  conn.on('open', () => {
    conn.send(payload);
    console.log("✅ Sent to", peerId);
    delete outbox[peerId];
    saveData();
    renderMessages();
  });

  conn.on('error', () => {
    if (!outbox[peerId]) outbox[peerId] = [];
    outbox[peerId].push(payload);
    console.log("📨 Queued for", peerId);
    saveData();
    renderMessages();
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

function renderMessages() {
  const inboxDiv = document.getElementById('inbox');
  inboxDiv.innerHTML = inbox.map(msg => 
    '<p><strong>From:</strong> ' + msg.from + '<br>' + msg.msg + '</p>'
  ).join('');

  const outboxDiv = document.getElementById('outbox');
  outboxDiv.innerHTML = Object.entries(outbox).map(([peerId, msgs]) => 
    msgs.map(m => '<p><strong>To:</strong> ' + peerId + '<br>Encrypted Message</p>').join('')
  ).join('');
}

loadData();
