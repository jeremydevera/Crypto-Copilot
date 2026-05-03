// ============================================================
// Terms of Use Page
// ============================================================

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: May 2, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          {/* Not Financial Advice — prominent disclaimer */}
          <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-5">
            <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ Not Financial Advice</h2>
            <p className="text-red-300">
              Trading Copilot is an <strong>educational and informational tool only</strong>. It does not provide financial, investment, or trading advice. All trading signals, scores, and indicators are generated from publicly available market data using algorithmic analysis and are provided "as is" without any warranty of accuracy or profitability.
            </p>
            <p className="text-red-300 mt-2">
              <strong>Past performance does not guarantee future results.</strong> Cryptocurrency markets are highly volatile and you may lose your entire investment. Always do your own research and consult a qualified financial advisor before making any investment decisions.
            </p>
          </div>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p className="text-gray-400">
              By accessing or using Trading Copilot ("the App"), you agree to be bound by these Terms of Use. If you do not agree, please do not use the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
            <p className="text-gray-400">
              Trading Copilot provides:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Real-time and historical cryptocurrency market data visualization.</li>
              <li>Algorithmic trading signal analysis based on technical indicators.</li>
              <li>Paper trading simulation for educational purposes.</li>
              <li>Account synchronization across devices via secure authentication.</li>
            </ul>
            <p className="text-gray-400 mt-2">
              The App does <strong>not</strong> execute real trades, connect to any exchange accounts, or handle real funds.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Paper Trading Disclaimer</h2>
            <p className="text-gray-400">
              The paper trading feature simulates trades using fictional money. Results from paper trading:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Do not represent real financial outcomes.</li>
              <li>May differ significantly from live trading due to slippage, liquidity, and market conditions.</li>
              <li>Should not be used as the sole basis for any investment decision.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. User Accounts</h2>
            <p className="text-gray-400">
              You are responsible for maintaining the confidentiality of your account credentials. You agree to:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Provide accurate and complete registration information.</li>
              <li>Notify us immediately of any unauthorized use of your account.</li>
              <li>Not share your account credentials with others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Intellectual Property</h2>
            <p className="text-gray-400">
              All content, design, and code in Trading Copilot are the intellectual property of the developer. You may not:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Copy, modify, or distribute the App's source code without permission.</li>
              <li>Use the App's branding, logos, or trademarks without authorization.</li>
              <li>Reverse-engineer, decompile, or disassemble the App.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Limitation of Liability</h2>
            <p className="text-gray-400">
              To the fullest extent permitted by law:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>The App is provided "as is" without warranties of any kind.</li>
              <li>We are not liable for any financial losses resulting from your use of the App.</li>
              <li>We are not liable for any interruptions, errors, or delays in market data.</li>
              <li>We make no guarantee that the App will be error-free or available at all times.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Market Data Accuracy</h2>
            <p className="text-gray-400">
              Market data is sourced from third-party providers (Binance, CoinGecko) and may be delayed, inaccurate, or incomplete. We do not guarantee the accuracy, timeliness, or completeness of any market data displayed in the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Prohibited Uses</h2>
            <p className="text-gray-400">
              You agree not to:
            </p>
            <ul className="list-disc list-inside text-gray-400 mt-2 space-y-1">
              <li>Use the App for any illegal purpose.</li>
              <li>Attempt to gain unauthorized access to our systems.</li>
              <li>Use the App to manipulate markets or engage in fraudulent activity.</li>
              <li>Redistribute market data in violation of data providers' terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Termination</h2>
            <p className="text-gray-400">
              We reserve the right to suspend or terminate your access to the App at any time, with or without cause, and with or without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Changes to Terms</h2>
            <p className="text-gray-400">
              We may update these Terms of Use from time to time. Continued use of the App after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
            <p className="text-gray-400">
              For questions about these Terms, please contact: <a href="mailto:support@tradingcopilot.app" className="text-green-400 hover:underline">support@tradingcopilot.app</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
