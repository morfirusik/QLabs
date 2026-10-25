let data = { chats: [] };
let selected = null;
const $ = id => document.getElementById(id);
const riskLabel = { low: 'НИЗКИЙ', medium: 'СРЕДНИЙ', high: 'ВЫСОКИЙ' };
const statusLabel = { new: 'Ожидает проверки', sent: 'Передано в антифрод (демо)', operator: 'Передано оператору (демо)', false_positive: 'Отмечено как ложное срабатывание' };
const reqLabel = { card: 'Карта', phone: 'Kaspi / телефон', url: 'Ссылка' };

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').style.display = 'block';
  setTimeout(() => $('toast').style.display = 'none', 3500);
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Ошибка запроса');
  return result;
}

function setData(next, id) {
  data = next;
  if (id !== undefined) selected = id;
  if (!data.chats.some(chat => chat.id === selected)) selected = data.chats[0]?.id || null;
  render();
}

function render() {
  const chats = data.chats;
  $('stat-chats').textContent = chats.length;
  $('stat-high').textContent = chats.filter(c => c.analysis.risk === 'high').length;
  $('stat-req').textContent = new Set(chats.flatMap(c => c.analysis.requisites.filter(r => r.type !== 'url').map(r => r.value))).size;
  const list = $('chat-list'); list.replaceChildren();
  chats.forEach(chat => {
    const button = el('button', 'chat-option' + (chat.id === selected ? ' active' : ''));
    button.append(el('strong', '', chat.title));
    const detail = el('span'); detail.append(el('i', 'mini-risk ' + chat.analysis.risk), document.createTextNode(chat.track_name + ' · ' + chat.analysis.score + ' баллов'));
    button.append(detail); button.onclick = () => { selected = chat.id; render(); }; list.append(button);
  });
  const chat = chats.find(c => c.id === selected);
  $('chat-title').textContent = chat?.title || 'Новая переписка';
  $('track-pill').textContent = chat?.track_name || 'Симуляция';
  const messages = $('messages'); messages.replaceChildren();
  if (!chat?.messages.length) {
    const starter = el('div', 'starter'); starter.append(el('div', 'starter-icon', '✦'), el('div', '', 'Напишите Сауле-апа от лица мошенника. Например: «Вам положена выплата от ЕНПФ, но сначала оплатите страховку».'));
    messages.append(starter);
  } else chat.messages.forEach(m => {
    const row = el('div', 'msg ' + m.role);
    row.append(el('div', 'who', m.role === 'apa' ? 'Сауле-апа' : 'Вы · роль мошенника'), el('div', 'bubble', m.text));
    messages.append(row);
  });
  messages.scrollTop = messages.scrollHeight;
  const a = chat?.analysis || { risk: 'low', score: 0, signals: [], requisites: [] };
  $('risk-badge').className = 'risk ' + a.risk; $('risk-badge').textContent = riskLabel[a.risk];
  $('score').textContent = a.score + ' баллов'; $('score-fill').style.width = Math.min(100, a.score / 9 * 100) + '%';
  $('signal-count').textContent = a.signals.length; $('requisite-count').textContent = a.requisites.length;
  const signals = $('signals'); signals.replaceChildren(); signals.className = 'item-list' + (a.signals.length ? '' : ' empty');
  if (!a.signals.length) signals.textContent = 'Пока нет признаков. Начните переписку.';
  a.signals.forEach(s => { const item = el('div', 'signal'); const head = el('div', 'signal-head'); head.append(el('span', '', s.label), el('span', 'signal-points', '+' + s.points)); item.append(head, el('div', 'quote', s.quote)); signals.append(item); });
  const reqs = $('requisites'); reqs.replaceChildren(); reqs.className = 'item-list' + (a.requisites.length ? '' : ' empty');
  if (!a.requisites.length) reqs.textContent = 'Реквизиты пока не обнаружены.';
  a.requisites.forEach(r => { const item = el('div', 'requisite'); item.append(el('small', '', reqLabel[r.type]), el('strong', '', r.value)); if (r.type === 'card') item.append(el('small', '', r.valid_luhn ? 'Контрольная сумма верна' : 'Контрольная сумма неверна')); reqs.append(item); });
  $('status-text').textContent = statusLabel[chat?.status || 'new'];
  $('send-review').disabled = a.risk !== 'high';
  document.querySelectorAll('[data-status]').forEach(button => button.disabled = !chat || (button.dataset.status === 'sent' && a.risk !== 'high'));
  const queue = $('queue'); queue.replaceChildren();
  [...chats].sort((x,y) => y.analysis.score - x.analysis.score).forEach(c => { const row = el('div', 'queue-row'); const title = el('div'); title.append(el('strong', '', c.title), el('small', '', c.track_name + ' · ' + statusLabel[c.status])); row.append(title, el('span', '', c.analysis.score + ' баллов'), el('span', 'risk ' + c.analysis.risk, riskLabel[c.analysis.risk])); row.onclick = () => { selected = c.id; render(); window.scrollTo({top:0,behavior:'smooth'}); }; queue.append(row); });
  const groups = new Map();
  chats.forEach(c => c.analysis.requisites.filter(r => r.type !== 'url').forEach(r => { const key = r.type + ':' + r.value; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c); }));
  const connections = $('connections'); connections.replaceChildren();
  const shared = [...groups.entries()].filter(([, owners]) => owners.length > 1);
  if (!shared.length) connections.append(el('div', 'no-data', 'Пока нет общих реквизитов. Укажите в новом чате карту 4111 1111 1111 1111, чтобы увидеть связь с демо-перепиской о пирамиде.'));
  shared.forEach(([key, owners]) => { const box = el('div', 'connection'); box.append(el('strong', '', key.split(':').slice(1).join(':')), el('p', '', owners.map(c => c.title).join(' ↔ '))); connections.append(box); });
}

$('new-chat').onclick = () => $('create-dialog').showModal();
$('close-dialog').onclick = () => $('create-dialog').close();
$('create-form').onsubmit = async event => {
  event.preventDefault();
  try { const next = await api('/api/chats', { track: $('track').value, title: $('new-title').value }); $('create-dialog').close(); $('new-title').value = ''; setData(next, next.id); $('message-input').focus(); }
  catch (error) { toast(error.message); }
};
$('image').onchange = () => $('file-name').textContent = $('image').files[0]?.name || '';
$('message-form').onsubmit = async event => {
  event.preventDefault();
  if (!selected) { toast('Сначала создайте переписку'); return; }
  const text = $('message-input').value.trim();
  const file = $('image').files[0];
  if (!text && !file) return;
  const button = document.querySelector('.send-button'); button.disabled = true;
  try {
    let image;
    if (file) image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    const next = await api('/api/chats/' + selected + '/messages', { text, image, image_name: file?.name });
    $('message-input').value = ''; $('image').value = ''; $('file-name').textContent = ''; setData(next);
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
};
document.querySelectorAll('[data-status]').forEach(button => button.onclick = async () => {
  try { setData(await api('/api/chats/' + selected + '/status', { status: button.dataset.status })); toast('Решение сохранено в демо'); }
  catch (error) { toast(error.message); }
});
api('/api/state').then(setData).catch(error => toast(error.message));
