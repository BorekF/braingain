'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPanel } from './AdminPanel';
import { Lock } from 'lucide-react';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Sprawdź czy użytkownik jest już zalogowany (sprawdź localStorage)
    if (typeof window !== 'undefined') {
      const storedSecret = localStorage.getItem('adminSecret');
      if (storedSecret) {
        // Weryfikuj czy hasło jest poprawne (porównaj z ADMIN_SECRET)
        verifyPassword(storedSecret);
      } else {
        setLoading(false);
      }
    }
  }, []);

  async function verifyPassword(providedPassword: string) {
    try {
      // Wysyłamy hasło do API endpoint do weryfikacji
      // Używamy endpoint /api/logs jako test (wymaga ADMIN_SECRET)
      const response = await fetch(`/api/logs?lines=1&secret=${encodeURIComponent(providedPassword)}`);
      
      if (response.ok) {
        // Hasło jest poprawne
        if (typeof window !== 'undefined') {
          localStorage.setItem('adminSecret', providedPassword);
        }
        setIsAuthenticated(true);
        setError('');
      } else {
        // Hasło jest niepoprawne
        if (typeof window !== 'undefined') {
          localStorage.removeItem('adminSecret');
        }
        setIsAuthenticated(false);
        setError('Niepoprawne hasło');
      }
    } catch (error) {
      setError('Błąd weryfikacji hasła');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    await verifyPassword(password);
  }

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminSecret');
    }
    setIsAuthenticated(false);
    setPassword('');
    setError('');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Ładowanie...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Lock className="text-blue-600" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Panel Administratora</h1>
            <p className="text-gray-600">Wprowadź hasło, aby kontynuować</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Hasło
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Wprowadź hasło..."
                autoFocus
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Weryfikowanie...' : 'Zaloguj się'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-lg transition-colors"
        >
          Wyloguj się
        </button>
      </div>
      <AdminPanel />
    </>
  );
}

