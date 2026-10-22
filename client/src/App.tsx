import { useCallback, useEffect, useState } from 'react';
import { fetchMe, logout } from './api';
import type { User } from './api';
import LoginForm from './LoginForm';
import OrdersPage from './OrdersPage';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const signedOut = useCallback(() => setUser(null), []);

  async function signOut() {
    await logout().catch(() => undefined);
    setUser(null);
  }

  if (checking) return <p className="muted center">Loading...</p>;
  if (!user) return <LoginForm onLogin={setUser} />;
  return <OrdersPage user={user} onLogout={signOut} onUnauthorized={signedOut} />;
}
