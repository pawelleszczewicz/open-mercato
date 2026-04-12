import { expect, test, type APIRequestContext } from '@playwright/test';
import { login } from '@open-mercato/core/helpers/integration/auth';
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api';

type MessageObjectTypesResponse = {
  items?: Array<{
    module?: string;
    entityType?: string;
    actions?: Array<{
      id?: string;
      href?: string;
    }>;
  }>;
};

function decodeJwtSubject(token: string): string {
  const payloadPart = token.split('.')[1] ?? '';
  const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { sub?: unknown };
  if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
    throw new Error('Auth token does not contain user subject');
  }
  return decoded.sub;
}

async function createTodo(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/example/todos', {
    token,
    data: { title, is_done: false },
  });
  expect(response.status()).toBe(201);

  const body = (await response.json()) as { id?: unknown };
  expect(typeof body.id).toBe('string');
  return body.id as string;
}

async function deleteTodoIfExists(
  request: APIRequestContext,
  token: string | null,
  todoId: string | null,
): Promise<void> {
  if (!token || !todoId) return;
  await apiRequest(request, 'DELETE', `/api/example/todos?id=${encodeURIComponent(todoId)}`, {
    token,
  }).catch(() => undefined);
}

async function deleteMessageIfExists(
  request: APIRequestContext,
  token: string | null,
  messageId: string | null,
): Promise<void> {
  if (!token || !messageId) return;
  await apiRequest(request, 'DELETE', `/api/messages/${encodeURIComponent(messageId)}`, {
    token,
  }).catch(() => undefined);
}

/**
 * TC-UMES-021: Standalone message object registry parity
 */
test.describe('TC-UMES-021: Standalone message object registry parity', () => {
  test('should register example message objects and render their detail components in the standalone app', async ({
    page,
    request,
  }) => {
    let adminToken: string | null = null;
    let messageId: string | null = null;
    let todoId: string | null = null;

    const seed = Date.now();
    const todoTitle = `QA TC-UMES-021 todo ${seed}`;
    const subject = `QA TC-UMES-021 message ${seed}`;

    try {
      adminToken = await getAuthToken(request, 'admin');
      const employeeToken = await getAuthToken(request, 'employee');
      const employeeUserId = decodeJwtSubject(employeeToken);

      todoId = await createTodo(request, adminToken, todoTitle);

      const objectTypesResponse = await apiRequest(
        request,
        'GET',
        '/api/messages/object-types?messageType=messages.defaultWithObjects',
        { token: adminToken },
      );
      expect(objectTypesResponse.ok()).toBeTruthy();

      const objectTypesBody = (await objectTypesResponse.json()) as MessageObjectTypesResponse;
      const todoObjectType = objectTypesBody.items?.find(
        (item) => item.module === 'example' && item.entityType === 'todo',
      );
      expect(todoObjectType).toBeTruthy();
      expect(
        todoObjectType?.actions?.some(
          (action) => action.id === 'view' && action.href === '/backend/todos/{entityId}/edit',
        ),
      ).toBe(true);

      const composeResponse = await apiRequest(request, 'POST', '/api/messages', {
        token: adminToken,
        data: {
          type: 'messages.defaultWithObjects',
          recipients: [{ userId: employeeUserId, type: 'to' }],
          subject,
          body: `Body for ${subject}`,
          objects: [{ entityModule: 'example', entityType: 'todo', entityId: todoId }],
        },
      });
      expect(composeResponse.status()).toBe(201);

      const composeBody = (await composeResponse.json()) as { id?: unknown };
      expect(typeof composeBody.id).toBe('string');
      messageId = composeBody.id as string;

      await login(page, 'admin');
      await page.goto(`/backend/messages/${messageId}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { name: /attached objects/i })).toBeVisible();

      const objectLink = page.locator(`a[href="/backend/todos/${todoId}/edit"]`).first();
      await expect(objectLink).toBeVisible();
      await expect(objectLink).toContainText(todoTitle);

      await objectLink.click();
      await expect(page).toHaveURL(new RegExp(`/backend/todos/${todoId}/edit(?:\\?.*)?$`));
      await expect(page.locator('input[name="title"]')).toHaveValue(todoTitle);
    } finally {
      await deleteMessageIfExists(request, adminToken, messageId);
      await deleteTodoIfExists(request, adminToken, todoId);
    }
  });
});
