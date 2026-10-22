import { randomUUID } from 'node:crypto';

const BASE = process.env.API_URL || 'http://localhost:3000';
const PARALLEL = Number(process.argv[2]) || 10;

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'agent@sarh.test', password: 'Agent123!' }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = login.headers.getSetCookie()[0].split(';')[0];
const headers = { 'Content-Type': 'application/json', Cookie: cookie };

const email = `proof-${Date.now()}@example.com`;
const body = JSON.stringify({
  uNumber: randomUUID(),
  customer: { name: 'Proof Customer', email, phone: '01000000000' },
  items: [{ productName: 'Test item', priceCents: 1999, quantity: 1 }],
});

console.log(`Sending the SAME create request ${PARALLEL} times in parallel...`);
const responses = await Promise.all(
  Array.from({ length: PARALLEL }, () => fetch(`${BASE}/api/orders`, { method: 'POST', headers, body })),
);
const statuses = responses.map((r) => r.status);
console.log('status codes:', statuses.join(' '));

const list = await fetch(`${BASE}/api/orders?q=${encodeURIComponent(email)}`, { headers });
const { items } = await list.json();
console.log(`orders in the database for ${email}: ${items.length}`);

const created = statuses.filter((s) => s === 201).length;
if (items.length === 1 && created === 1) {
  console.log('PASS: exactly one order exists.');
} else {
  console.log('FAIL: expected exactly one order.');
  process.exit(1);
}
