let data = { chats: [] };
let selected = null;
const staticMode = location.hostname.endsWith('github.io') || location.protocol === 'file:' || new URLSearchParams(location.search).has('static');
const $ = id => document.getElementById(id);
const riskLabel = { low: 'ПОКА СПОКОЙНО', medium: 'ЕСТЬ ПОДОЗРЕНИЕ', high: 'ПОХОЖЕ НА ОБМАН' };
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
  if (staticMode) return staticApi(path, body);
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Ошибка запроса');
  return result;
}

const staticTracks = { compensation: 'Компенсации', lottery: 'Розыгрыши', casino: 'Казино', pyramid: 'Пирамиды' };
function staticAnalyze(messages) {
  const text = messages.filter(m => m.role === 'scammer').map(m => m.text).join('\n');
  const signals = [];
  const rules = [
    ['advance', 3, /оплат|страхов|комис|взнос|перевед/i, 'Предоплата за выплату или приз'],
    ['secret', 3, /cvv|cvc|код из смс|смс.код|пин/i, 'Запрос секретных данных'],
    ['profit', 2, /доход|прибыл|заработ|выигр|удво|процент/i, 'Обещание дохода или выигрыша'],
    ['impersonation', 2, /енпф|нацбанк|полици|банк/i, 'Представляется организацией'],
    ['urgency', 1, /срочн|только сегодня|последн|прямо сейчас/i, 'Давление и срочность'],
    ['referral', 1, /пригласи|приведи|реферал/i, 'Приглашение новых участников']
  ];
  rules.forEach(([key, points, regex, label]) => { const match = text.match(regex); if (match) signals.push({ key, points, label, quote: match[0] }); });
  const cards = text.match(/(?:\d[ -]?){15,18}\d/g) || [];
  const phones = text.match(/(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s()\-]*\d{2}[\s()\-]*\d{2}/g) || [];
  const requisites = [];
  for (const card of cards) {
    const value = card.replace(/\D/g, '');
    if (value.length < 16 || value.length > 19 || requisites.some(r => r.type === 'card' && r.value === value)) continue;
    const digits = [...value].reverse().map(Number);
    const valid_luhn = digits.reduce((sum, n, i) => { const doubled = i % 2 ? n * 2 : n; return sum + (doubled > 9 ? doubled - 9 : doubled); }, 0) % 10 === 0;
    requisites.push({ type: 'card', value, valid_luhn });
  }
  for (const phone of phones) {
    const value = '+7' + phone.replace(/\D/g, '').slice(1);
    if (!requisites.some(r => r.type === 'phone' && r.value === value)) requisites.push({ type: 'phone', value });
  }
  if (requisites.length && /перев|оплат|карт|kaspi|номер/i.test(text)) signals.push({ key: 'private_payment', points: 3, label: 'Реквизиты для перевода', quote: 'Реквизиты в контексте перевода' });
  const score = signals.reduce((sum, s) => sum + s.points, 0);
  return { score, risk: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low', signals, requisites };
}
function staticApa(messages) {
  const text = messages.filter(m => m.role === 'scammer').map(m => m.text).join(' ');
  if (/cvv|cvc|код из смс|смс.код|пин/i.test(text)) return 'Ой такие коды я не называю. Спасибо вам, до свидания';
  if (!/деньг|выплат|оплат|перевод|карт|kaspi|компенсац|приз|доход|енпф|инвест|казино/i.test(text)) return 'Кажется вы ошиблись номером. Всего доброго';
  if (staticAnalyze(messages).requisites.length) return 'Рахмет, записала. У меня Kaspi что то не проходит, можно другой номер или карту?';
  return 'Да я хочу попробовать, айналайын. Куда мне перевести? Напишите номер карты или Kaspi покрупнее';
}
function staticSave(chats) { localStorage.setItem('qlabs-chats', JSON.stringify(chats)); return { chats, rule_names: {} }; }
function staticRead() {
  const saved = JSON.parse(localStorage.getItem('qlabs-chats') || 'null');
  if (saved) {
    if (!localStorage.getItem('qlabs-simple-start')) {
      localStorage.setItem('qlabs-simple-start', '1');
      if (!saved.some(chat => chat.messages.length === 0)) saved.unshift({ id: Date.now(), title: 'Новый разговор', track: 'compensation', track_name: 'Компенсации', status: 'new', messages: [], analysis: staticAnalyze([]) });
      return staticSave(saved);
    }
    return { chats: saved };
  }
  const messages = [{ id: 1, role: 'scammer', text: 'Пассивный доход: вложите 5000 ₸ и получите 10000 через неделю. Переводите на карту 4111 1111 1111 1111. Пригласи двух друзей!' }, { id: 2, role: 'apa', text: 'Ой интересно, а как это работает? Внук мне поможет' }];
  localStorage.setItem('qlabs-simple-start', '1');
  return staticSave([{ id: Date.now(), title: 'Новый разговор', track: 'compensation', track_name: 'Компенсации', status: 'new', messages: [], analysis: staticAnalyze([]) }, { id: 1, title: 'Инвестиционный клуб', track: 'pyramid', track_name: 'Пирамиды', status: 'new', messages, analysis: staticAnalyze(messages) }]);
}
function staticApi(path, body) {
  const state = staticRead(); const chats = state.chats;
  if (path === '/api/state') return Promise.resolve(state);
  if (path === '/api/chats') { const id = Date.now(); const chat = { id, title: body.title || staticTracks[body.track], track: body.track, track_name: staticTracks[body.track], status: 'new', messages: [], analysis: staticAnalyze([]) }; chats.unshift(chat); return Promise.resolve({ ...staticSave(chats), id }); }
  const match = path.match(/\/api\/chats\/(\d+)\/(messages|status)/); if (!match) return Promise.reject(new Error('Не найдено'));
  const chat = chats.find(c => c.id === Number(match[1]));
  if (match[2] === 'status') { if (body.status === 'sent' && chat.analysis.risk !== 'high') return Promise.reject(new Error('Передача доступна только для высокого риска')); chat.status = body.status; }
  else { chat.messages.push({ id: Date.now(), role: 'scammer', text: body.text || '[Изображение добавлено]' }); chat.messages.push({ id: Date.now() + 1, role: 'apa', text: staticApa(chat.messages) }); }
  chat.analysis = staticAnalyze(chat.messages); return Promise.resolve(staticSave(chats));
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
    const starter = el('div', 'starter'); starter.append(el('div', 'starter-icon', '💬'), el('div', '', 'Напишите Сауле-апа первое сообщение. Она вам ответит.'));
    const example = el('button', 'example-button', 'Подставить пример сообщения');
    example.onclick = () => { $('message-input').value = 'Вам положена выплата от ЕНПФ, но сначала оплатите страховку. Только сегодня!'; $('message-input').focus(); };
    starter.append(example);
    messages.append(starter);
  } else chat.messages.forEach(m => {
    const row = el('div', 'msg ' + m.role);
    row.append(el('div', 'who', m.role === 'apa' ? 'Сауле-апа' : 'Вы · роль мошенника'), el('div', 'bubble', m.text));
    messages.append(row);
  });
  messages.scrollTop = messages.scrollHeight;
  const a = chat?.analysis || { risk: 'low', score: 0, signals: [], requisites: [] };
  $('risk-badge').className = 'risk ' + a.risk; $('risk-badge').textContent = riskLabel[a.risk];
  $('result-explain').textContent = !chat?.messages.length ? 'Напишите сообщение, чтобы начать проверку.' : a.risk === 'high' ? 'В переписке есть признаки обмана. Решение должен принять человек.' : a.risk === 'medium' ? 'Есть подозрительные слова. Посмотрите переписку внимательнее.' : 'Пока явных признаков обмана не найдено.';
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
if (staticMode) { $('file-label').style.display = 'none'; $('file-name').textContent = 'Публичное демо: изображения доступны в серверной версии.'; }
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
