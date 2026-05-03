import XCTest
@testable import AI_Crypto_Analyzer

final class AI_Crypto_AnalyzerTests: XCTestCase {
    func testTradeQuoteIncludesFeeSpreadAndTwoToOneRewardRisk() {
        let quote = SignalEngine.calculateTradeQuote(
            investmentAmount: 100_000,
            entryPrice: 5_000_000,
            feeAndSpreadPercent: 0.5
        )

        XCTAssertEqual(quote.breakevenPrice, 5_025_000, accuracy: 0.01)
        XCTAssertEqual(quote.stopLoss, 4_925_000, accuracy: 0.01)
        XCTAssertEqual(quote.target1, 5_075_000, accuracy: 0.01)
        XCTAssertEqual(quote.target2, 5_150_000, accuracy: 0.01)
        XCTAssertEqual(quote.rewardRisk, 2.0, accuracy: 0.001)
    }

    @MainActor
    func testPaperTradeBuyAndSellCalculatesNetProfitAfterFees() throws {
        let store = PaperTradingStore(feePercent: 0.1)
        store.reset(balance: 100_000)

        try store.buy(symbol: "BTCUSDT", price: 5_000_000, amount: 10_000)
        XCTAssertEqual(store.demoBalance, 90_000, accuracy: 0.01)
        XCTAssertNotNil(store.openPosition)

        let trade = try store.sell(price: 5_100_000)

        XCTAssertEqual(trade.buyFee, 10, accuracy: 0.01)
        XCTAssertEqual(trade.profit, 179.698, accuracy: 0.01)
        XCTAssertEqual(store.demoBalance, 100_179.698, accuracy: 0.01)
        XCTAssertNil(store.openPosition)
        XCTAssertEqual(store.history.count, 1)
    }

    func testSignalEngineProducesBuyLeaningSignalWhenEvidenceAligns() {
        let fiveMinute = makeCandles(count: 120, start: 100, step: 1.2, finalVolume: 4_000)
        let fifteenMinute = makeCandles(count: 120, start: 80, step: 1.0, finalVolume: 3_000)

        let signal = SignalEngine.analyze(
            symbol: "BTCUSDT",
            fiveMinuteCandles: fiveMinute,
            fifteenMinuteCandles: fifteenMinute
        )

        XCTAssertGreaterThanOrEqual(signal.buyScore.total, 60)
        XCTAssertTrue([.wait, .considerBuy, .strongBuy].contains(signal.decision))
        XCTAssertGreaterThanOrEqual(signal.rewardRisk, 2)
    }

    func testSignalEngineMatchesEnhancedBuyScoreWeights() {
        let fiveMinute = makeCandles(count: 120, start: 100, step: 1.2, finalVolume: 4_000)
        let fifteenMinute = makeCandles(count: 120, start: 80, step: 1.0, finalVolume: 3_000)

        let signal = SignalEngine.analyze(
            symbol: "BTCUSDT",
            fiveMinuteCandles: fiveMinute,
            fifteenMinuteCandles: fifteenMinute
        )

        XCTAssertLessThanOrEqual(signal.buyScore.marketStructure, 20)
        XCTAssertLessThanOrEqual(signal.buyScore.liquidity, 20)
        XCTAssertLessThanOrEqual(signal.buyScore.volatility, 15)
        XCTAssertLessThanOrEqual(signal.buyScore.session, 10)
        XCTAssertLessThanOrEqual(signal.buyScore.entryConfirmation, 15)
        XCTAssertLessThanOrEqual(signal.buyScore.riskManagement, 20)
        XCTAssertLessThanOrEqual(signal.buyScore.total, 100)
    }

    func testActivePositionStopLossForcesSellExitAndCapsSellScore() {
        let fiveMinute = makeCandles(count: 120, start: 100, step: 1.2, finalVolume: 4_000)
            .replacingLastClose(with: 98.40)
        let fifteenMinute = makeCandles(count: 120, start: 80, step: 1.0, finalVolume: 3_000)

        let signal = SignalEngine.analyze(
            symbol: "BTCUSDT",
            fiveMinuteCandles: fiveMinute,
            fifteenMinuteCandles: fifteenMinute,
            activeEntryPrice: 100,
            activeInvestmentAmount: 10_000
        )

        XCTAssertEqual(signal.decision, .sellExit)
        XCTAssertEqual(signal.sellScore, 100)
        XCTAssertLessThanOrEqual(signal.sellScore, 100)
        XCTAssertTrue(signal.warnings.contains("Hard exit: stop loss hit"))
    }

    func testActivePositionTargetForcesSellExitAndCapsSellScore() {
        let fiveMinute = makeCandles(count: 120, start: 100, step: 1.2, finalVolume: 4_000)
            .replacingLastClose(with: 101.50)
        let fifteenMinute = makeCandles(count: 120, start: 80, step: 1.0, finalVolume: 3_000)

        let signal = SignalEngine.analyze(
            symbol: "BTCUSDT",
            fiveMinuteCandles: fiveMinute,
            fifteenMinuteCandles: fifteenMinute,
            activeEntryPrice: 100,
            activeInvestmentAmount: 10_000
        )

        XCTAssertEqual(signal.decision, .sellExit)
        XCTAssertEqual(signal.sellScore, 100)
        XCTAssertLessThanOrEqual(signal.sellScore, 100)
        XCTAssertTrue(signal.warnings.contains("Hard exit: target hit"))
    }

    func testSignalEngineOutputsSuggestedPositionSizeFromAccountRiskFormula() {
        let fiveMinute = makeCandles(count: 120, start: 100, step: 1.2, finalVolume: 4_000)
        let fifteenMinute = makeCandles(count: 120, start: 80, step: 1.0, finalVolume: 3_000)

        let signal = SignalEngine.analyze(
            symbol: "BTCUSDT",
            fiveMinuteCandles: fiveMinute,
            fifteenMinuteCandles: fifteenMinute,
            demoBalance: 100_000,
            positionRiskPercent: 1
        )

        let riskPerCoin = signal.entryPrice - signal.stopLoss
        XCTAssertEqual(signal.accountRiskAmount, 1_000, accuracy: 0.01)
        XCTAssertEqual(signal.suggestedPositionSize, 1_000 / riskPerCoin, accuracy: 0.000001)
        XCTAssertEqual(signal.suggestedPositionValue, signal.suggestedPositionSize * signal.entryPrice, accuracy: 0.01)
    }

    private func makeCandles(
        count: Int,
        start: Double,
        step: Double,
        finalVolume: Double
    ) -> [Candle] {
        let baseDate = Date(timeIntervalSince1970: 1_800_000_000)

        return (0..<count).map { index in
            let trend = start + Double(index) * step
            let wave = sin(Double(index) * 0.45) * step * 5
            let pullback = index == count - 2 ? -step * 1.2 : 0
            let closeBoost = index == count - 1 ? step * 1.5 : 0
            let close = trend + wave + pullback + closeBoost
            let open = close - step * 0.35
            let volume = index == count - 1 ? finalVolume : 1_000 + Double(index % 12) * 30

            return Candle(
                openTime: baseDate.addingTimeInterval(Double(index * 300)),
                open: open,
                high: close + step * 0.8,
                low: min(open, close) - step * 1.1,
                close: close,
                volume: volume
            )
        }
    }
}

private extension Array where Element == Candle {
    func replacingLastClose(with close: Double) -> [Candle] {
        guard var last = last else { return self }
        var copy = self
        last.high = Swift.max(last.high, close)
        last.low = Swift.min(last.low, close)
        last.close = close
        copy[copy.count - 1] = last
        return copy
    }
}
