// ============================================================
// Privacy Policy Page
// ============================================================

import { useState } from 'react';

export default function PrivacyPolicy() {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: May 2, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h2>
            <p className="text-gray-400">
              Trading Copilot collects minimal personal information. When you create an account, we collect:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li><strong>Email address</strong> — used solely for account authentication and important notifications.</li>
              <li><strong>Account preferences</strong> — demo balance, investment amount, risk settings, and favorite pairs.</li>
              <li><strong>Paper trading history</strong> — your simulated trade records stored to persist across sessions.</li>
            </ul>
            <p className="text-gray-400 mt-2">
              We do <strong>not</strong> collect real financial information, banking details, or personally identifiable information beyond your email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-gray-400 space-y-1">
              <li>To authenticate your account and sync your settings across devices.</li>
              <li>To store and retrieve your paper trading history.</li>
              <li>To improve the app's performance and reliability.</li>
            </ul>
            <p className="text-gray-400 mt-2">
              We do <strong>not</strong> sell, share, or distribute your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Data Storage & Security</h2>
            <p className="text-gray-400">
              Your data is stored securely using <strong>Supabase</strong> (hosted on AWS) with Row Level Security (RLS) enabled. This means:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Only you can access your own data.</li>
              <li>All data in transit is encrypted via HTTPS/TLS.</li>
              <li>Passwords are hashed and never stored in plain text.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Market Data</h2>
            <p className="text-gray-400">
              Market data (prices, candles, order book) is sourced from public APIs including Binance and CoinGecko. This data is:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Publicly available and not personally identifiable.</li>
              <li>Cached on our servers for performance but not associated with your account.</li>
              <li>Subject to the respective data providers' terms of service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Cookies & Local Storage</h2>
            <p className="text-gray-400">
              Trading Copilot uses browser local storage to save your preferences (demo balance, settings) for offline access. We do not use tracking cookies or third-party analytics.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Data Retention & Deletion</h2>
            <p className="text-gray-400">
              You can delete your account at any time. Upon deletion, all associated data (settings, paper trades) is permanently removed within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Children's Privacy</h2>
            <p className="text-gray-400">
              Trading Copilot is not intended for use by individuals under the age of 18. We do not knowingly collect data from minors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Changes to This Policy</h2>
            <p className="text-gray-400">
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
            <p className="text-gray-400">
              For privacy-related inquiries, please contact: <a href="mailto:support@tradingcopilot.app" className="text-green-400 hover:underline">support@tradingcopilot.app</a>
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-800 text-center">
          <button
            onClick={() => setShowFull(!showFull)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showFull ? 'Show Less' : 'View Full Legal Text'}
          </button>
        </div>
      </div>
    </div>
  );
}