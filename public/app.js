'use strict';

const form = document.querySelector('#ticket-form');
const formMessage = document.querySelector('#form-message');
const list = document.querySelector('#ticket-list');
const count = document.querySelector('#count');
const listMessage = document.querySelector('#list-message');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#filter-status');
const categoryFilter = document.querySelector('#filter-category');
const priorityFilter = document.querySelector('#filter-priority');

const statusLabels = { new: 'Новая', in_progress: 'В работе', resolved: 'Завершена' };
const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const categoryLabels = { hardware: 'Оборудование', software: 'ПО', network: 'Сеть' };
let lastRequest = 0;

function createTicketElement(ticket) {
  const li = document.createElement('li');
  li.className = 'ticket';
  li.dataset.testid = 'ticket-item';
  li.dataset.id = String(ticket.id);

  const title = document.createElement('h3');
  title.className = 'ticket-title';
  title.textContent = ticket.title;

  const description = document.createElement('p');
  description.className = 'ticket-description';
  description.textContent = ticket.description;

  const meta = document.createElement('div');
  meta.className = 'ticket-meta';
  [categoryLabels[ticket.category], priorityLabels[ticket.priority], statusLabels[ticket.status]].forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    meta.appendChild(span);
  });

  li.append(title, description, meta);

  if (ticket.status !== 'resolved') {
    const button = document.createElement('button');
    button.dataset.id = String(ticket.id);
    button.dataset.next = ticket.status === 'new' ? 'in_progress' : 'resolved';
    button.textContent = ticket.status === 'new' ? 'В работу' : 'Завершить';
    li.appendChild(button);
  }

  return li;
}

async function loadTickets() {
  const requestId = ++lastRequest;
  try {
    const query = new URLSearchParams({
      search: search.value,
      status: statusFilter.value,
      category: categoryFilter.value,
      priority: priorityFilter.value
    });
    const response = await fetch(`/api/tickets?${query.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== lastRequest) return;
    listMessage.textContent = '';
    count.textContent = String(data.total);

    if (data.total === 0) {
      list.textContent = 'Заявок по заданным условиям нет.';
    } else {
      list.replaceChildren(...data.items.map(createTicketElement));
    }
  } catch (_) {
    if (requestId !== lastRequest) return;
    listMessage.textContent = 'Не удалось загрузить заявки.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  formMessage.textContent = '';
  try {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      const issues = Object.values(data.errors || {});
      formMessage.textContent = issues.join(' / ') || data.error || 'Ошибка при сохранении';
      return;
    }
    formMessage.textContent = `Заявка №${data.ticket.id} создана`;
    form.reset();
    await loadTickets();
  } catch (_) {
    formMessage.textContent = 'Нет связи с сервером';
  }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const response = await fetch(`/api/tickets/${button.dataset.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: button.dataset.next })
  });
  if (!response.ok) {
    listMessage.textContent = 'Не удалось обновить статус';
    return;
  }
  await loadTickets();
});

[search, statusFilter, categoryFilter, priorityFilter].forEach((element) =>
  element.addEventListener('input', loadTickets)
);
loadTickets();