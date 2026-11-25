import { TicketsPage } from '../pages/TicketsPage';
import { TicketForm } from '../pages/TicketForm';

const page = new TicketsPage();
const form = new TicketForm();

describe('HelpDesk — E2E-проверки', () => {
  beforeEach(() => {
    cy.request('POST', '/api/__reset');
  });

  it('показывает исходные заявки', () => {
    page.open();
    cy.get('[data-testid="page-title"]').should('contain', 'HelpDesk');
    page.items().should('have.length', 4);
    page.count().should('have.text', '4');
  });

  it('создает новую заявку через форму и отображает её в реестре', () => {
    cy.intercept('POST', '/api/tickets').as('createTicket');
    page.open();

    form.fill({
      title: 'Сбой проектора в 301',
      description: 'Проектор не выводит изображение с ноутбука',
      category: 'hardware',
      priority: 'high'
    });
    form.submit();

    cy.wait('@createTicket').its('response.statusCode').should('eq', 201);
    form.message().should('contain', 'Заявка №5 создана');
    page.count().should('have.text', '5');
    page.items().should('have.length', 5);
    page.itemByTitle('Сбой проектора в 301').should('be.visible');
  });

  it('выполняет поиск и комбинированную фильтрацию по статусу, категории и приоритету', () => {
    page.open();
    page.items().should('have.length', 4);

    page.searchFor('vpn');
    page.setStatus('new');
    page.setCategory('network');
    page.setPriority('high');

    page.count().should('have.text', '1');
    page.items().should('have.length', 1);
    page.items().first().find('.ticket-title').should('have.text', 'VPN недоступен');
  });

  it('переводит заявку из статуса new в in_progress и затем в resolved', () => {
    cy.intercept('PATCH', '/api/tickets/*/status').as('patchStatus');
    page.open();

    page.clickActionForTitle('VPN недоступен');
    cy.wait('@patchStatus').its('response.statusCode').should('eq', 200);
    page.itemByTitle('VPN недоступен').should('contain', 'В работе');

    page.clickActionForTitle('VPN недоступен');
    cy.wait('@patchStatus').its('response.statusCode').should('eq', 200);
    page.itemByTitle('VPN недоступен').should('contain', 'Завершена');
    page.itemByTitle('VPN недоступен').find('button').should('not.exist');
  });

  it('отображает HTML-разметку в теме и описании как обычный текст (защита от XSS)', () => {
    cy.intercept('POST', '/api/tickets').as('createTicket');
    page.open();

    const unsafeTitle = '<b id="xss-title">Сбой сети</b>';
    const unsafeDescription = '<i id="xss-desc">Тест безопасного вывода</i>';

    form.fill({
      title: unsafeTitle,
      description: unsafeDescription,
      category: 'network',
      priority: 'medium'
    });
    form.submit();

    cy.wait('@createTicket').its('response.statusCode').should('eq', 201);
    cy.get('#xss-title').should('not.exist');
    cy.get('#xss-desc').should('not.exist');
    page.itemByTitle(unsafeTitle).find('.ticket-description').should('have.text', unsafeDescription);
  });
});