import { useState } from 'react';
import type { FormEvent } from 'react';
import { createOrder } from './api';
import { formatMoney } from './format';

interface Line {
  productName: string;
  price: string;
  quantity: string;
}

const emptyLine = (): Line => ({ productName: '', price: '', quantity: '1' });

function toCents(price: string): number {
  return Math.round(Number(price) * 100);
}

function validate(name: string, email: string, phone: string, lines: Line[]): string | null {
  if (!name.trim()) return 'Customer name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Customer email is not valid';
  if (phone.trim().length < 6) return 'Phone must be at least 6 characters';
  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    if (!line.productName.trim()) return `Item ${n}: product name is required`;
    const cents = toCents(line.price);
    if (!Number.isFinite(cents) || cents < 1) return `Item ${n}: price must be more than 0`;
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return `Item ${n}: quantity must be a whole number from 1 to 99`;
  }
  return null;
}

export default function CreateOrderForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  // One key per form. It stays the same on retries, so a resend can never make a second order.
  const [uNumber] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((sum, l) => {
    const cents = toCents(l.price);
    const qty = Number(l.quantity);
    return Number.isFinite(cents) && Number.isFinite(qty) ? sum + cents * qty : sum;
  }, 0);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validate(name, email, phone, lines);
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      const { duplicate } = await createOrder({
        uNumber,
        customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
        items: lines.map((l) => ({
          productName: l.productName.trim(),
          priceCents: toCents(l.price),
          quantity: Number(l.quantity),
        })),
      });
      if (duplicate) setNotice('This order was already saved. Nothing was added twice.');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? `${err.message}. You can press Save again, it is safe.` : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>New order</h2>
      <div className="grid3">
        <label>Customer name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>

      <h3>Items</h3>
      {lines.map((line, i) => (
        <div className="line" key={i}>
          <input
            placeholder="Product"
            aria-label={`Item ${i + 1} product`}
            value={line.productName}
            onChange={(e) => updateLine(i, { productName: e.target.value })}
          />
          <input
            placeholder="Price"
            aria-label={`Item ${i + 1} price`}
            inputMode="decimal"
            value={line.price}
            onChange={(e) => updateLine(i, { price: e.target.value })}
          />
          <input
            placeholder="Qty"
            aria-label={`Item ${i + 1} quantity`}
            inputMode="numeric"
            value={line.quantity}
            onChange={(e) => updateLine(i, { quantity: e.target.value })}
          />
          <button type="button" className="ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="ghost" disabled={lines.length >= 20} onClick={() => setLines([...lines, emptyLine()])}>
        + Add item
      </button>

      <p className="total">Total: <strong>{formatMoney(total)}</strong></p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save order'}</button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
