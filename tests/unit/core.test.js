'use strict';
const {
  normalizeTitle,
  validateTicketInput,
  canChangeStatus,
  filterAndSort
} = require('../../src/core');

describe('Базовые unit-тесты', () => {
  test('удаляет пробелы в начале и конце темы', () => {
    expect(normalizeTitle('  Ошибка принтера  ')).toBe('Ошибка принтера');
  });

  test('отклоняет неизвестную категорию', () => {
    const errors = validateTicketInput({
      title: 'Ошибка печати',
      description: 'Принтер не печатает документ',
      category: 'unknown',
      priority: 'low'
    });
    expect(errors).toHaveProperty('category');
  });

  test('запрещает возвращение из закрытого статуса', () => {
    expect(canChangeStatus('resolved', 'new')).toBe(false);
  });
});

describe('Самостоятельные unit-тесты', () => {
  test('normalizeTitle сжимает повторяющиеся пробелы и переносы в один пробел', () => {
    expect(normalizeTitle('  Сбой   VPN\t\nв   корпусе  ')).toBe('Сбой VPN в корпусе');
  });

  test.each([
    ['короткая тема (4 символа)', 'Сбой', true],
    ['пробелы вокруг короткой темы (3 значимых символа)', '   abc   ', true],
    ['нижняя граница темы (5 символов)', 'Сбой1', false],
    ['верхняя граница темы (80 символов) с внешними пробелами', `  ${'А'.repeat(80)}  `, false],
    ['превышение длины темы (81 символ)', 'А'.repeat(81), true]
  ])('validateTicketInput проверяет границы длины темы: %s', (_label, title, shouldHaveError) => {
    const errors = validateTicketInput({
      title,
      description: 'Корректное описание проблемы',
      category: 'network',
      priority: 'medium'
    });
    expect(Boolean(errors.title)).toBe(shouldHaveError);
  });

  test('validateTicketInput отклоняет описание короче 10 символов после trim', () => {
    const errors = validateTicketInput({
      title: 'Сбой сети',
      description: '   123456789   ',
      category: 'network',
      priority: 'high'
    });
    expect(errors).toHaveProperty('description');
  });

  test('canChangeStatus разрешает только new -> in_progress -> resolved и запрещает пропуск этапа', () => {
    expect(canChangeStatus('new', 'in_progress')).toBe(true);
    expect(canChangeStatus('in_progress', 'resolved')).toBe(true);
    expect(canChangeStatus('new', 'resolved')).toBe(false);
    expect(canChangeStatus('in_progress', 'new')).toBe(false);
  });

  test('filterAndSort сортирует по приоритету (high -> medium -> low) и новизне createdAt', () => {
    const tickets = [
      { id: 1, title: 'Низкий', description: 'Описание 1', category: 'hardware', priority: 'low', status: 'new', createdAt: '2026-10-05T10:00:00.000Z' },
      { id: 2, title: 'Высокий старый', description: 'Описание 2', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T09:00:00.000Z' },
      { id: 3, title: 'Средний', description: 'Описание 3', category: 'software', priority: 'medium', status: 'new', createdAt: '2026-10-02T12:00:00.000Z' },
      { id: 4, title: 'Высокий новый', description: 'Описание 4', category: 'network', priority: 'high', status: 'resolved', createdAt: '2026-10-04T15:00:00.000Z' }
    ];

    const result = filterAndSort(tickets);
    expect(result.map((t) => t.id)).toEqual([4, 2, 3, 1]);
  });

  test('filterAndSort ищет без учёта регистра и обрезает пробелы в запросе', () => {
    const tickets = [
      { id: 1, title: 'VPN недоступен', description: 'Сбой сети', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T09:00:00.000Z' },
      { id: 2, title: 'Принтер', description: 'Закончилась бумага', category: 'hardware', priority: 'low', status: 'new', createdAt: '2026-10-02T09:00:00.000Z' }
    ];

    const byTitle = filterAndSort(tickets, { search: '  vpn  ' });
    const byDesc = filterAndSort(tickets, { search: 'БУМАГА' });
    expect(byTitle.map((t) => t.id)).toEqual([1]);
    expect(byDesc.map((t) => t.id)).toEqual([2]);
  });

  test('filterAndSort фильтрует по приоритету совместно со статусом и категорией (AND)', () => {
    const tickets = [
      { id: 1, title: 'Заявка 1', description: 'Описание 101', category: 'network', priority: 'high', status: 'new', createdAt: '2026-10-01T09:00:00.000Z' },
      { id: 2, title: 'Заявка 2', description: 'Описание 102', category: 'network', priority: 'low', status: 'new', createdAt: '2026-10-02T09:00:00.000Z' },
      { id: 3, title: 'Заявка 3', description: 'Описание 103', category: 'software', priority: 'high', status: 'new', createdAt: '2026-10-03T09:00:00.000Z' }
    ];

    const result = filterAndSort(tickets, { priority: 'high', category: 'network', status: 'new' });
    expect(result.map((t) => t.id)).toEqual([1]);
  });
});