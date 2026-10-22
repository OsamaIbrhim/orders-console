import { useState } from 'react';
import { deleteOrder } from './api';
import type { Filters, User } from './api';
import CreateOrderForm from './CreateOrderForm';
import { formatDate, formatMoney } from './format';
import { useDebounced } from './useDebounced';
import { useOrders } from './useOrders';

const SORTS = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'total:desc', label: 'Highest amount' },
  { value: 'total:asc', label: 'Lowest amount' },
];
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

interface Props {
  user: User;
  onLogout: () => void;
  onUnauthorized: () => void;
}

export default function OrdersPage({ user, onLogout, onUnauthorized }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortValue, setSortValue] = useState('date:desc');
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 300);
  const [sort, dir] = sortValue.split(':') as [Filters['sort'], Filters['dir']];
  const filters: Filters = { q: debouncedSearch, status, sort, dir };

  const { items, loading, loadingMore, error, hasMore, loadMore } = useOrders(filters, reloadKey, onUnauthorized);

  async function remove(id: number) {
    if (!window.confirm(`Delete order #${id}? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteOrder(id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  return (
    <main>
      <header className="bar">
        <h1>Orders Console</h1>
        <div className="who">
          <span>{user.email} ({user.role})</span>
          <button className="ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      {creating ? (
        <CreateOrderForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setSortValue('date:desc');
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <div className="filters card">
          <input
            type="search"
            placeholder="Search name or email (starts with)"
            aria-label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Sort" value={sortValue} onChange={(e) => setSortValue(e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={() => setCreating(true)}>New order</button>
        </div>
      )}

      {actionError && <p className="error" role="alert">{actionError}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <table className="card">
        <thead>
          <tr>
            <th>#</th><th>Customer</th><th>Email</th><th>Status</th><th className="num">Total</th><th>Created</th>
            {user.role === 'admin' && <th />}
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.customerName}</td>
              <td>{o.customerEmail}</td>
              <td><span className={`badge ${o.status}`}>{o.status}</span></td>
              <td className="num">{formatMoney(o.totalCents)}</td>
              <td>{formatDate(o.createdAt)}</td>
              {user.role === 'admin' && (
                <td><button className="ghost danger" onClick={() => remove(o.id)}>Delete</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {loading && <p className="muted">Loading...</p>}
      {!loading && !error && items.length === 0 && <p className="muted">No orders match.</p>}
      {hasMore && (
        <button className="more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </main>
  );
}
