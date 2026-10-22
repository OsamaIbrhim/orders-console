export type Role = 'admin' | 'agent';
export interface User {
  email: string;
  role: Role;
}

export interface Order {
  id: number;
  customerName: string;
  customerEmail: string;
  status: string;
  totalCents: number;
  createdAt: string;
}

export interface OrdersPage {
  items: Order[];
  nextCursor: string | null;
}

export interface Filters {
  q: string;
  status: string;
  sort: 'date' | 'total';
  dir: 'asc' | 'desc';
}

export interface NewOrder {
  uNumber: string;
  customer: { name: string; email: string; phone: string };
  items: { productName: string; priceCents: number; quantity: number }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const login = (email: string, password: string) =>
  request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const logout = () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' });

export const fetchMe = () => request<{ user: User }>('/api/auth/me');

export function listOrders(filters: Filters, cursor: string | null, signal: AbortSignal) {
  const params = new URLSearchParams({ sort: filters.sort, dir: filters.dir });
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (cursor) params.set('cursor', cursor);
  return request<OrdersPage>(`/api/orders?${params}`, { signal });
}

export const createOrder = (order: NewOrder) =>
  request<{ order: Order; duplicate: boolean }>('/api/orders', { method: 'POST', body: JSON.stringify(order) });

export const deleteOrder = (id: number) => request<{ ok: true }>(`/api/orders/${id}`, { method: 'DELETE' });

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
