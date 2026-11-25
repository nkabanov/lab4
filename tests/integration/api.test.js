'use strict';
const { createApp } = require('../../src/app');

let server;
let base;

async function createTicket(payload) {
  return fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

beforeEach(async () => {
  server = createApp({ seed: [] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health отвечает HTTP 200', async () => {
  const response = await fetch(`${base}/api/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('POST /api/tickets создает корректную заявку', async () => {
  const response = await createTicket({
    title: 'Сбой принтера',
    description: 'Принтер в аудитории не отвечает',
    category: 'hardware',
    priority: 'medium'
  });
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.ticket.id).toBe(1);
  expect(body.ticket.status).toBe('new');
});

test('POST /api/tickets сохраняет нормализованную заявку и она возвращается в GET /api/tickets', async () => {
  // Arrange
  const payload = {
    title: '  Сбой   VPN в корпусе  ',
    description: '  Не удается подключиться к учебной сети  ',
    category: 'network',
    priority: 'high'
  };

  // Act
  const postRes = await createTicket(payload);
  const postBody = await postRes.json();
  const getRes = await fetch(`${base}/api/tickets`);
  const getBody = await getRes.json();

  // Assert
  expect(postRes.status).toBe(201);
  expect(postBody.ticket.title).toBe('Сбой VPN в корпусе');
  expect(getRes.status).toBe(200);
  expect(getBody.total).toBe(1);
  expect(getBody.items[0].id).toBe(postBody.ticket.id);
  expect(getBody.items[0].description).toBe('Не удается подключиться к учебной сети');
});

test('POST /api/tickets с невалидной темой возвращает HTTP 400 и не меняет хранилище', async () => {
  // Arrange
  const badPayload = {
    title: '   abc   ',
    description: 'Описание достаточной длины',
    category: 'software',
    priority: 'low'
  };

  // Act
  const postRes = await createTicket(badPayload);
  const postBody = await postRes.json();
  const getRes = await fetch(`${base}/api/tickets`);
  const getBody = await getRes.json();

  // Assert
  expect(postRes.status).toBe(400);
  expect(postBody.errors).toHaveProperty('title');
  expect(getBody.total).toBe(0);
  expect(getBody.items).toEqual([]);
});

test('GET /api/tickets комбинирует search + status + category по логике AND без учета регистра', async () => {
  // Arrange
  await createTicket({
    title: 'VPN не подключается',
    description: 'Ошибка авторизации в сети',
    category: 'network',
    priority: 'high'
  });
  const second = await (await createTicket({
    title: 'VPN в другом корпусе',
    description: 'Проблема с подключением к сети',
    category: 'network',
    priority: 'medium'
  })).json();
  await fetch(`${base}/api/tickets/${second.ticket.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' })
  });
  await createTicket({
    title: 'Настройка VPN клиента',
    description: 'Нужно переустановить программу',
    category: 'software',
    priority: 'low'
  });

  // Act
  const response = await fetch(`${base}/api/tickets?search=vpn&status=new&category=network`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body.total).toBe(1);
  expect(body.items[0].title).toBe('VPN не подключается');
});

test('PATCH /api/tickets/:id/status запрещает пропуск этапа (new -> resolved) с HTTP 409', async () => {
  // Arrange
  const created = await (await createTicket({
    title: 'Сбой монитора',
    description: 'Не включается экран на рабочем месте',
    category: 'hardware',
    priority: 'medium'
  })).json();

  // Act
  const patchRes = await fetch(`${base}/api/tickets/${created.ticket.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' })
  });
  const listBody = await (await fetch(`${base}/api/tickets`)).json();

  // Assert
  expect(patchRes.status).toBe(409);
  expect(listBody.items[0].status).toBe('new');
});

test('GET /api/tickets возвращает заявки в порядке приоритета и новизны createdAt', async () => {
  // Arrange
  await new Promise((resolve) => server.close(resolve));
  server = createApp({
    seed: [
      { id: 1, title: 'Низкий', description: 'Описание 01', category: 'hardware', priority: 'low', status: 'new', createdAt: '2026-10-05T10:00:00.000Z' },
      { id: 2, title: 'Высокий старый', description: 'Описание 02', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T09:00:00.000Z' },
      { id: 3, title: 'Средний', description: 'Описание 03', category: 'software', priority: 'medium', status: 'new', createdAt: '2026-10-02T10:00:00.000Z' },
      { id: 4, title: 'Высокий новый', description: 'Описание 04', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-04T15:00:00.000Z' }
    ]
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Act
  const response = await fetch(`${base}/api/tickets`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body.items.map((t) => t.id)).toEqual([4, 2, 3, 1]);
});

test('TDD: GET /api/tickets?priority=high фильтрует заявки по приоритету', async () => {
  // Arrange
  await createTicket({
    title: 'Критичный сбой сети',
    description: 'Отсутствует доступ в интернет во всем корпусе',
    category: 'network',
    priority: 'high'
  });
  await createTicket({
    title: 'Замена клавиатуры',
    description: 'Залипает клавиша пробел в аудитории 204',
    category: 'hardware',
    priority: 'low'
  });

  // Act
  const response = await fetch(`${base}/api/tickets?priority=high`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body.total).toBe(1);
  expect(body.items[0].priority).toBe('high');
  expect(body.items[0].title).toBe('Критичный сбой сети');
});