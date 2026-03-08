'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Lock } from 'lucide-react';

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function AdminPanelLink() {
  const [showModal, setShowModal] = useState(false);

  if (!IS_DEMO) {
    return (
      <Link
        href="/admin"
        className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm sm:text-base"
      >
        <Settings size={18} />
        Admin Panel
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm sm:text-base"
      >
        <Settings size={18} />
        Admin Panel
      </button>

      {showModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 w-80 text-center">
            <div className="flex justify-center mb-3">
              <div className="p-3 bg-amber-100 rounded-full">
                <Lock className="text-amber-600" size={28} />
              </div>
            </div>
            <p className="font-bold text-gray-800 text-lg mb-1">Demo Mode</p>
            <p className="text-gray-500 text-sm mb-5">
              The Admin Panel is not available in this demo.
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </>
  );
}
