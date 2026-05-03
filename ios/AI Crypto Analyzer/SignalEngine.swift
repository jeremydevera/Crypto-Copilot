import Foundation

enum SignalEngine {
    static let tradingFeePercent = 0.1
    static let defaultFeeAndSpreadPercent = 0.5
    static let defaultSlippagePercent = 0.05

    static func analyze(
        symbol: String,
        fiveMinuteCandles: [Candle],
        fifteenMinuteCandles: [Candle],
        feeAndSpreadPercent: Double = defaultFeeAndSpreadPercent,
        investmentAmount: Double = 100_000,
        demoBalance: Double = 100_000,
        activeEntryPrice: Double? = nil,
        activeInvestmentAmount: Double? = nil,
        positionRiskPercent: Double = 1,
        marketMicrostructure: MarketMicrostructure = .empty
    ) -> TradingSignal {
        guard let latest = fiveMinuteCandles.last else {
            return TradingSignal.placeholder
        }

        let fiveMinute = IndicatorEngine.snapshot(for: fiveMinuteCandles)
        let fifteenMinute = IndicatorEngine.snapshot(for: fifteenMinuteCandles)
        let price = latest.close
        let quoteEntryPrice = activeEntryPrice ?? price
        let quoteInvestmentAmount = activeInvestmentAmount ?? investmentAmount

        // Pre-compute swing points for structure-based stops/targets
        let preSwingLow = latestSwingLow(beforeLastCandleIn: fiveMinuteCandles)
        let preSwingHigh = latestSwingHigh(beforeLastCandleIn: fiveMinuteCandles)
        let preNearestResistance = nearestSwingHighAbovePrice(in: fiveMinuteCandles, price: price)
        let nextResistance = nearestSwingHighAbovePrice(in: fiveMinuteCandles, price: price * 1.005)
        let farResistance = nearestSwingHighAbovePrice(in: fiveMinuteCandles, price: price * 1.02)

        let quote = calculateTradeQuote(
            investmentAmount: quoteInvestmentAmount,
            entryPrice: quoteEntryPrice,
            feeAndSpreadPercent: feeAndSpreadPercent,
            structureStopLoss: preSwingLow?.price,
            structureTarget1: nextResistance?.price,
            structureTarget2: farResistance?.price
        )

        var buyScore = ScoreBreakdown()
        var sellBreakdown = SellScoreBreakdown()
        var reasons: [String] = []
        var warnings: [String] = []
        var hardFilterFailed = false
        let normalBuyScore = calculateNormalBuyScore(
            fiveMinuteCandles: fiveMinuteCandles,
            fifteenMinuteCandles: fifteenMinuteCandles,
            quote: quote
        )

        let fifteenMinuteStructure = marketStructure(for: fifteenMinuteCandles)
        let latestFiveMinuteSwingLow = preSwingLow
        let latestFiveMinuteSwingHigh = preSwingHigh
        let nearestResistance = preNearestResistance
        let atrRatio = atrRatio(for: fiveMinuteCandles)
        let riskAmount = estimatedRiskAmount(
            investmentAmount: quoteInvestmentAmount,
            entryPrice: quote.entryPrice,
            stopLoss: quote.stopLoss
        )
        let accountRiskPercent = demoBalance > 0 ? (riskAmount / demoBalance) * 100 : .infinity
        let accountRiskAmount = demoBalance * (positionRiskPercent / 100)
        let suggestedPositionSize = suggestedPositionSize(
            accountRiskAmount: accountRiskAmount,
            entryPrice: quote.entryPrice,
            stopLoss: quote.stopLoss
        )
        let suggestedPositionValue = suggestedPositionSize * quote.entryPrice
        let hasActivePosition = activeEntryPrice != nil
        let stopLossHit = hasActivePosition && price <= quote.stopLoss
        let targetHit = hasActivePosition && (price >= quote.target1 || price >= quote.target2)

        if fifteenMinuteStructure.isBullish {
            buyScore.marketStructure += 10
            reasons.append("15m structure is bullish with higher high and higher low")
        }

        if price > (fifteenMinute.ema50 ?? .infinity) {
            buyScore.marketStructure += 5
            reasons.append("15m price is above EMA50")
        }
        
        if let ema9 = fifteenMinute.ema9, let ema21 = fifteenMinute.ema21, ema9 > ema21 {
            buyScore.marketStructure += 5
            reasons.append("15m EMA9 is above EMA21")
        }

        if let swingLow = latestFiveMinuteSwingLow,
           latest.low < swingLow.price,
           latest.close > swingLow.price {
            buyScore.liquidity += 10
            reasons.append("price swept a recent low and reclaimed it")
        }

        let riskPerUnit = max(price - quote.stopLoss, 0)
        if let resistance = nearestResistance {
            if resistance.price - price >= riskPerUnit * 2 {
                buyScore.liquidity += 5
                reasons.append("nearest resistance leaves at least 2R of room")
            }

            if price < resistance.price * 0.995 {
                buyScore.liquidity += 5
                reasons.append("price is not directly under resistance")
            }
        } else {
            buyScore.liquidity += 10
            reasons.append("no nearby swing resistance is blocking the setup")
        }

        if let depthImbalance = marketMicrostructure.depthImbalance {
            if depthImbalance > 0.05 {
                buyScore.liquidity = min(20, buyScore.liquidity + 5)
                reasons.append("order book depth has stronger bid support")
            } else if depthImbalance < -0.2 {
                warnings.append("Order book depth shows ask-side pressure")
            }
        }

        if let atrRatio {
            switch atrRatio {
            case 0.8...1.8:
                buyScore.volatility += 15
                reasons.append("ATR volatility is in the tradable range")
            case 0.5..<0.8, 1.8...2.5:
                buyScore.volatility += 8
                reasons.append("ATR volatility is acceptable but imperfect")
            case ..<0.5:
                hardFilterFailed = true
                warnings.append("Hard filter: volatility is too low")
            case 3.0...:
                hardFilterFailed = true
                warnings.append("Hard filter: volatility is too extreme")
            default:
                warnings.append("Volatility is elevated")
            }
        } else {
            warnings.append("ATR volatility needs more candles")
        }

        if let volumeRatio = fiveMinute.volumeRatio, volumeRatio >= 1.2 {
            buyScore.session += 7
            reasons.append("market participation is active")
        }

        if let spreadPercent = marketMicrostructure.spreadPercent {
            if spreadPercent <= 0.05 {
                buyScore.session += 3
                reasons.append("live bid/ask spread is acceptable")
            } else {
                warnings.append("Live bid/ask spread is wide")
            }
        } else if feeAndSpreadPercent <= 1.0 {
            buyScore.session += 3
            reasons.append("estimated spread and fees are acceptable")
        } else {
            warnings.append("Estimated spread and fees are high")
        }

        if let rsi = fiveMinute.rsi14, (45...65).contains(rsi), fiveMinute.isRSIRising {
            buyScore.entryConfirmation += 5
            reasons.append("RSI is in range and rising")
        }

        if fiveMinute.isMACDBullish {
            buyScore.entryConfirmation += 5
            reasons.append("MACD is bullish on 5m")
        }

        if let ema21 = fiveMinute.ema21, latest.close > ema21 {
            buyScore.entryConfirmation += 5
            reasons.append("5m candle closed above EMA21")
        } else if let previous = fiveMinuteCandles.dropLast().last, price > previous.high {
            buyScore.entryConfirmation += 5
            reasons.append("price broke the previous 5m candle high")
        }

        if quote.rewardRisk >= 2 {
            buyScore.riskManagement += 10
            reasons.append("reward/risk is at least 2:1")
        }

        if let swingLow = latestFiveMinuteSwingLow, quote.stopLoss < swingLow.price {
            buyScore.riskManagement += 5
            reasons.append("stop loss is below recent structure")
        } else if quote.stopLoss < latest.low {
            buyScore.riskManagement += 5
            reasons.append("stop loss is below the current candle low")
        }

        if accountRiskPercent <= 2 {
            buyScore.riskManagement += 5
            reasons.append("position size risks no more than 2% of demo balance")
        } else {
            hardFilterFailed = true
            warnings.append("Hard filter: position risk is above 2% of demo balance")
        }

        // MARK: - Sell Score Breakdown (5 categories matching enhanced doc)

        // A. Structure Weakness (max 25)
        if let swingLow = latestFiveMinuteSwingLow, price < swingLow.price {
            sellBreakdown.structureWeakness += 10
        }
        if let ema9 = fiveMinute.ema9, let ema21 = fiveMinute.ema21, ema9 < ema21 {
            sellBreakdown.structureWeakness += 5
        }
        if let ema9 = fifteenMinute.ema9, let ema21 = fifteenMinute.ema21, ema9 < ema21 {
            sellBreakdown.structureWeakness += 5
        }
        if price < (fifteenMinute.ema50 ?? 0) {
            sellBreakdown.structureWeakness += 5
        }

        // B. Liquidity Rejection (max 20)
        if let swingHigh = latestFiveMinuteSwingHigh,
           latest.high > swingHigh.price,
           latest.close < swingHigh.price {
            sellBreakdown.liquidityRejection += 10
        }
        if let resistance = fiveMinute.resistance, price >= resistance * 0.995 {
            sellBreakdown.liquidityRejection += 5
        }
        if hasLargeUpperWick(latest) {
            sellBreakdown.liquidityRejection += 5
        }

        // C. Momentum Weakness (max 20)
        if let rsi = fiveMinute.rsi14, let previous = fiveMinute.previousRSI14, rsi > 70, rsi < previous {
            sellBreakdown.momentumWeakness += 7
            warnings.append("RSI is falling from overbought")
        }
        if fiveMinute.isMACDBearish {
            sellBreakdown.momentumWeakness += 7
        }
        if isBearishCandle(latest), fiveMinute.volumeAboveAverage {
            sellBreakdown.momentumWeakness += 6
        }

        // D. Volatility Risk (max 15)
        if let atrRatio, atrRatio > 2.5 {
            sellBreakdown.volatilityRisk += 8
        }
        if isLargeBearishCandle(latest, candles: fiveMinuteCandles) {
            sellBreakdown.volatilityRisk += 7
        }

        // E. Exit Risk (max 20)
        if price >= quote.target1 {
            sellBreakdown.exitRisk += 10
        }
        if price <= quote.stopLoss {
            sellBreakdown.exitRisk += 20
            warnings.append("Stop loss level is hit")
        }
        if quote.rewardRisk < 2 {
            sellBreakdown.exitRisk += 5
        }

        var sellScore = sellBreakdown.total

        if targetHit {
            sellScore = 100
            warnings.append("Hard exit: target hit")
        } else if stopLossHit {
            sellScore = 100
            warnings.append("Hard exit: stop loss hit")
        } else {
            sellScore = min(sellScore, 100)
        }

        applyHardFilters(
            marketStructureScore: buyScore.marketStructure,
            entryConfirmationScore: buyScore.entryConfirmation,
            quote: quote,
            fiveMinute: fiveMinute,
            hardFilterFailed: &hardFilterFailed,
            warnings: &warnings
        )

        let backtest = estimateBacktestProbability(
            fiveMinuteCandles: fiveMinuteCandles,
            fifteenMinuteCandles: fifteenMinuteCandles,
            currentBuyScore: buyScore.total,
            rewardRisk: quote.rewardRisk,
            feeAndSpreadPercent: feeAndSpreadPercent
        )

        if let expectedValue = backtest.expectedValueR,
           backtest.total >= 10,
           expectedValue <= 0,
           buyScore.total >= 75 {
            hardFilterFailed = true
            warnings.append("Hard filter: backtested expectancy is not positive")
        }

        let decision = decision(
            buyScore: buyScore.total,
            sellScore: sellScore,
            hardFilterFailed: hardFilterFailed
        )
        let marketState = marketState(
            fifteenMinuteStructure: fifteenMinuteStructure,
            marketStructureScore: buyScore.marketStructure,
            sellScore: sellScore
        )
        let setupType = setupType(
            hasSweep: buyScore.liquidity >= 10,
            isBreakout: latestFiveMinuteSwingHigh.map { price > $0.price } ?? false,
            entryScore: buyScore.entryConfirmation
        )

        // MARK: - Market Regime Detection
        let regime = detectMarketRegime(
            atrRatio: atrRatio,
            fifteenMinuteStructure: fifteenMinuteStructure,
            fiveMinuteCandles: fiveMinuteCandles,
            price: price,
            fifteenMinute: fifteenMinute
        )
        if regime == .ranging {
            warnings.append("Market is ranging — trend signals may underperform")
        } else if regime == .volatile_chop {
            warnings.append("Market is volatile/choppy — increased risk of whipsaw")
        } else if regime == .quiet {
            warnings.append("Market is quiet — low participation may cause false signals")
        }

        // MARK: - Trailing Stop Logic
        let trailingStop = calculateTrailingStop(
            price: price,
            entryPrice: quoteEntryPrice,
            stopLoss: quote.stopLoss,
            breakevenPrice: quote.breakevenPrice,
            target1: quote.target1,
            target2: quote.target2,
            fiveMinuteSwingLow: latestFiveMinuteSwingLow,
            fiveMinuteEMA9: fiveMinute.ema9,
            hasActivePosition: hasActivePosition
        )

        // MARK: - Normal/Pro Confluence Check
        let confluenceWarning = checkConfluence(
            normalScore: normalBuyScore.total,
            proScore: buyScore.total
        )

        return TradingSignal(
            symbol: symbol,
            price: price,
            decision: decision,
            risk: riskLevel(score: buyScore.total, warnings: warnings),
            buyScore: buyScore,
            normalBuyScore: normalBuyScore,
            sellScoreBreakdown: sellBreakdown,
            sellScore: sellScore,
            entryPrice: price,
            breakevenPrice: quote.breakevenPrice,
            stopLoss: quote.stopLoss,
            target1: quote.target1,
            target2: quote.target2,
            rewardRisk: quote.rewardRisk,
            suggestedPositionSize: suggestedPositionSize,
            suggestedPositionValue: suggestedPositionValue,
            accountRiskAmount: accountRiskAmount,
            accountRiskPercent: accountRiskPercent.isFinite ? accountRiskPercent : 0,
            positionRiskPercent: positionRiskPercent,
            reasons: reasons.isEmpty ? ["Market data loaded, but conditions are not aligned yet"] : reasons,
            warnings: warnings,
            fiveMinute: fiveMinute,
            fifteenMinute: fifteenMinute,
            marketState: marketState,
            marketRegime: regime,
            setupType: setupType,
            backtest: backtest,
            trailingStop: trailingStop,
            confluenceWarning: confluenceWarning
        )
    }

    static func calculateTradeQuote(
        investmentAmount: Double,
        entryPrice: Double,
        feeAndSpreadPercent: Double,
        slippagePercent: Double = defaultSlippagePercent,
        structureStopLoss: Double? = nil,
        structureTarget1: Double? = nil,
        structureTarget2: Double? = nil
    ) -> TradeQuote {
        guard entryPrice > 0 else {
            return TradeQuote(
                investmentAmount: investmentAmount,
                entryPrice: entryPrice,
                feeAndSpreadPercent: feeAndSpreadPercent,
                slippagePercent: slippagePercent,
                breakevenPrice: 0,
                target1: 0,
                target2: 0,
                stopLoss: 0,
                rewardRisk: 0
            )
        }

        let costPercent = feeAndSpreadPercent / 100
        let slippageMultiplier = 1 + slippagePercent / 100
        let adjustedEntry = entryPrice * slippageMultiplier
        let breakeven = adjustedEntry * (1 + costPercent)

        // Structure-based stop loss: use swing low if available, otherwise fallback to 1.5%
        let stopLoss: Double
        if let structure = structureStopLoss, structure < adjustedEntry {
            // Place stop just below the swing low with a small buffer
            stopLoss = structure * (1 - 0.001)
        } else {
            stopLoss = adjustedEntry * 0.985
        }

        // Structure-based targets: use swing high if available, otherwise fallback to percentages
        let target1: Double
        if let structure = structureTarget1, structure > adjustedEntry {
            target1 = structure
        } else {
            target1 = adjustedEntry * 1.015
        }

        let target2: Double
        if let structure = structureTarget2, structure > adjustedEntry {
            target2 = structure
        } else {
            target2 = adjustedEntry * 1.03
        }

        let risk = adjustedEntry - stopLoss
        let reward = target2 - adjustedEntry
        let rewardRisk = risk > 0 ? reward / risk : 0

        return TradeQuote(
            investmentAmount: investmentAmount,
            entryPrice: adjustedEntry,
            feeAndSpreadPercent: feeAndSpreadPercent,
            slippagePercent: slippagePercent,
            breakevenPrice: breakeven,
            target1: target1,
            target2: target2,
            stopLoss: stopLoss,
            rewardRisk: rewardRisk
        )
    }

    private static func calculateNormalBuyScore(
        fiveMinuteCandles: [Candle],
        fifteenMinuteCandles: [Candle],
        quote: TradeQuote
    ) -> NormalScoreBreakdown {
        guard let latest = fiveMinuteCandles.last else { return NormalScoreBreakdown() }

        let fiveMinute = IndicatorEngine.snapshot(for: fiveMinuteCandles)
        let fifteenMinute = IndicatorEngine.snapshot(for: fifteenMinuteCandles)
        var score = NormalScoreBreakdown()
        let price = latest.close

        if price > (fifteenMinute.ema50 ?? .infinity) {
            score.trend += 15
        }

        if let ema9 = fifteenMinute.ema9, let ema21 = fifteenMinute.ema21, ema9 > ema21 {
            score.trend += 15
        }

        if let rsi = fiveMinute.rsi14, (45...65).contains(rsi) {
            score.momentum += 10
        }

        if fiveMinute.isRSIRising {
            score.momentum += 5
        }

        if fiveMinute.isMACDBullish {
            score.momentum += 10
        }

        if fiveMinute.volumeAboveAverage {
            score.volume += 15
        }

        if let ema21 = fiveMinute.ema21, price >= ema21, price <= ema21 * 1.01 {
            score.entry += 5
        }

        if isBullishCandle(latest) {
            score.entry += 5
        }

        if let previous = fiveMinuteCandles.dropLast().last, price > previous.high {
            score.entry += 5
        }

        if quote.rewardRisk >= 2 {
            score.riskReward += 15
        }

        return score
    }

    private static func estimateBacktestProbability(
        fiveMinuteCandles: [Candle],
        fifteenMinuteCandles: [Candle],
        currentBuyScore: Int,
        rewardRisk: Double,
        feeAndSpreadPercent: Double
    ) -> BacktestEstimate {
        let forwardWindow = 24
        guard fiveMinuteCandles.count > 90,
              fifteenMinuteCandles.count > 60,
              rewardRisk > 0 else {
            return .unavailable
        }

        var wins = 0
        var total = 0
        let minimumIndex = 60
        let maximumIndex = fiveMinuteCandles.count - forwardWindow - 1

        guard minimumIndex < maximumIndex else { return .unavailable }

        for index in minimumIndex...maximumIndex {
            let candidate = fiveMinuteCandles[index]
            let fiveHistory = Array(fiveMinuteCandles[0...index])
            let fifteenHistory = fifteenMinuteCandles.filter { $0.openTime <= candidate.openTime }
            guard fifteenHistory.count >= 60 else { continue }

            let candidateScore = quickEnhancedBuyScore(
                fiveMinuteCandles: fiveHistory,
                fifteenMinuteCandles: fifteenHistory,
                feeAndSpreadPercent: feeAndSpreadPercent
            )

            guard abs(candidateScore - currentBuyScore) <= 10, candidateScore >= 60 else {
                continue
            }

            total += 1
            if tradeWouldWin(
                entry: candidate.close,
                futureCandles: Array(fiveMinuteCandles[(index + 1)...(index + forwardWindow)])
            ) {
                wins += 1
            }
        }

        guard total > 0 else { return .unavailable }

        let probability = Double(wins) / Double(total)
        let feeImpactR = feeAndSpreadPercent / 1.5
        let expectedValueR = (probability * rewardRisk) - ((1 - probability) * 1) - feeImpactR

        return BacktestEstimate(
            probability: probability * 100,
            wins: wins,
            total: total,
            expectedValueR: expectedValueR
        )
    }

    private static func quickEnhancedBuyScore(
        fiveMinuteCandles: [Candle],
        fifteenMinuteCandles: [Candle],
        feeAndSpreadPercent: Double
    ) -> Int {
        guard let latest = fiveMinuteCandles.last else { return 0 }

        let fiveMinute = IndicatorEngine.snapshot(for: fiveMinuteCandles)
        let fifteenMinute = IndicatorEngine.snapshot(for: fifteenMinuteCandles)
        let price = latest.close
        let swingLow = latestSwingLow(beforeLastCandleIn: fiveMinuteCandles)
        let quote = calculateTradeQuote(
            investmentAmount: 100_000,
            entryPrice: price,
            feeAndSpreadPercent: feeAndSpreadPercent,
            structureStopLoss: swingLow?.price
        )
        let structure = marketStructure(for: fifteenMinuteCandles)
        let resistance = nearestSwingHighAbovePrice(in: fiveMinuteCandles, price: price)
        let riskPerUnit = max(price - quote.stopLoss, 0)
        var score = 0

        if structure.isBullish { score += 10 }
        if price > (fifteenMinute.ema50 ?? .infinity) { score += 5 }
        if let ema9 = fifteenMinute.ema9, let ema21 = fifteenMinute.ema21, ema9 > ema21 { score += 5 }

        if let swingLow, latest.low < swingLow.price, latest.close > swingLow.price { score += 10 }
        if let resistance {
            if resistance.price - price >= riskPerUnit * 2 { score += 5 }
            if price < resistance.price * 0.995 { score += 5 }
        } else {
            score += 10
        }

        if let atrRatio = atrRatio(for: fiveMinuteCandles) {
            if (0.8...1.8).contains(atrRatio) { score += 15 }
            else if (0.5..<0.8).contains(atrRatio) || (1.8...2.5).contains(atrRatio) { score += 8 }
        }

        if let volumeRatio = fiveMinute.volumeRatio, volumeRatio >= 1.2 { score += 7 }
        if feeAndSpreadPercent <= 1.0 { score += 3 }

        if let rsi = fiveMinute.rsi14, (45...65).contains(rsi), fiveMinute.isRSIRising { score += 5 }
        if fiveMinute.isMACDBullish { score += 5 }
        if let ema21 = fiveMinute.ema21, latest.close > ema21 { score += 5 }
        else if let previous = fiveMinuteCandles.dropLast().last, price > previous.high { score += 5 }

        if quote.rewardRisk >= 2 { score += 10 }
        if let swingLow, quote.stopLoss < swingLow.price { score += 5 }
        else if quote.stopLoss < latest.low { score += 5 }
        score += 5

        return min(score, 100)
    }

    private static func tradeWouldWin(entry: Double, futureCandles: [Candle]) -> Bool {
        let stopLoss = entry * 0.985
        let target = entry * 1.03

        for candle in futureCandles {
            if candle.low <= stopLoss { return false }
            if candle.high >= target { return true }
        }

        // After forward window expires, count as win only if clearly profitable
        guard let lastClose = futureCandles.last?.close else { return false }
        return lastClose > entry * 1.005  // Must be at least 0.5% above entry
    }

    private static func decision(
        buyScore: Int,
        sellScore: Int,
        hardFilterFailed: Bool
    ) -> SignalDecision {
        if sellScore >= 80 { return .sellExit }
        if sellScore >= 65 { return .considerSell }
        if hardFilterFailed { return .noTrade }

        switch buyScore {
        case 85...:
            return .strongBuy
        case 75..<85:
            return .considerBuy
        case 60..<75:
            return .wait
        default:
            return .noTrade
        }
    }

    private static func riskLevel(score: Int, warnings: [String]) -> RiskLevel {
        if warnings.contains(where: { $0.hasPrefix("Hard filter") }) {
            return .high
        }

        switch score {
        case 80...:
            return .low
        case 60..<80:
            return .medium
        default:
            return .high
        }
    }

    private static func applyHardFilters(
        marketStructureScore: Int,
        entryConfirmationScore: Int,
        quote: TradeQuote,
        fiveMinute: IndicatorSnapshot,
        hardFilterFailed: inout Bool,
        warnings: inout [String]
    ) {
        if marketStructureScore < 10 {
            hardFilterFailed = true
            warnings.append("Hard filter: 15m market state is not bullish")
        }

        if entryConfirmationScore == 0 {
            hardFilterFailed = true
            warnings.append("Hard filter: 5m entry setup is not valid")
        }

        if let rsi = fiveMinute.rsi14, rsi > 70 {
            hardFilterFailed = true
            warnings.append("Hard filter: RSI is too high to chase")
        }

        if quote.rewardRisk < 2 {
            hardFilterFailed = true
            warnings.append("Hard filter: reward/risk is below 2:1")
        }
    }

    private static func marketState(
        fifteenMinuteStructure: MarketStructure,
        marketStructureScore: Int,
        sellScore: Int
    ) -> String {
        if sellScore >= 65 { return "Weakening" }
        if fifteenMinuteStructure.isBullish { return "Bullish" }
        if marketStructureScore >= 10 { return "Bullish Breakout" }
        if fifteenMinuteStructure.isBearish { return "Bearish" }
        return "Neutral"
    }

    // Backtest results are estimates, not guarantees. Past performance does not guarantee future results.

    private static func setupType(hasSweep: Bool, isBreakout: Bool, entryScore: Int) -> String {
        if hasSweep && entryScore > 0 { return "Liquidity Sweep + Confirmation" }
        if isBreakout && entryScore > 0 { return "Breakout Confirmation" }
        if entryScore > 0 { return "Pullback Confirmation" }
        return "No Valid Entry"
    }

    private static func isBullishCandle(_ candle: Candle) -> Bool {
        candle.close > candle.open
    }

    private static func isBearishCandle(_ candle: Candle) -> Bool {
        candle.close < candle.open
    }

    private static func hasLargeUpperWick(_ candle: Candle) -> Bool {
        let body = abs(candle.close - candle.open)
        let upperWick = candle.high - max(candle.open, candle.close)
        return upperWick > max(body, 0.0001) * 1.5
    }

    private static func isLargeBearishCandle(_ candle: Candle, candles: [Candle]) -> Bool {
        guard isBearishCandle(candle) else { return false }
        let ranges = candles.suffix(20).map { $0.high - $0.low }
        guard !ranges.isEmpty else { return false }
        let averageRange = ranges.reduce(0, +) / Double(ranges.count)
        return candle.high - candle.low > averageRange * 1.5
    }

    private static func estimatedRiskAmount(
        investmentAmount: Double,
        entryPrice: Double,
        stopLoss: Double
    ) -> Double {
        guard entryPrice > 0, stopLoss < entryPrice else { return .infinity }
        let quantity = investmentAmount / entryPrice
        return quantity * (entryPrice - stopLoss)
    }

    private static func suggestedPositionSize(
        accountRiskAmount: Double,
        entryPrice: Double,
        stopLoss: Double
    ) -> Double {
        let riskPerCoin = entryPrice - stopLoss
        guard accountRiskAmount > 0, riskPerCoin > 0 else { return 0 }
        return accountRiskAmount / riskPerCoin
    }

    private struct SwingPoint {
        let index: Int
        let price: Double
    }

    private struct MarketStructure {
        let latestHigh: SwingPoint?
        let previousHigh: SwingPoint?
        let latestLow: SwingPoint?
        let previousLow: SwingPoint?

        var isBullish: Bool {
            guard let latestHigh, let previousHigh, let latestLow, let previousLow else { return false }
            return latestHigh.price > previousHigh.price && latestLow.price > previousLow.price
        }

        var isBearish: Bool {
            guard let latestHigh, let previousHigh, let latestLow, let previousLow else { return false }
            return latestHigh.price < previousHigh.price && latestLow.price < previousLow.price
        }
    }

    private static func marketStructure(for candles: [Candle]) -> MarketStructure {
        let highs = swingHighs(in: candles)
        let lows = swingLows(in: candles)

        return MarketStructure(
            latestHigh: highs.last,
            previousHigh: highs.dropLast().last,
            latestLow: lows.last,
            previousLow: lows.dropLast().last
        )
    }

    private static func latestSwingLow(beforeLastCandleIn candles: [Candle]) -> SwingPoint? {
        swingLows(in: Array(candles.dropLast())).last
    }

    private static func latestSwingHigh(beforeLastCandleIn candles: [Candle]) -> SwingPoint? {
        swingHighs(in: Array(candles.dropLast())).last
    }

    private static func nearestSwingHighAbovePrice(in candles: [Candle], price: Double) -> SwingPoint? {
        swingHighs(in: candles)
            .filter { $0.price > price }
            .min { $0.price < $1.price }
    }

    // MARK: - Public helpers for structure-based stops (used by MarketViewModel)

    static func latestSwingLowPublic(fiveMinuteCandles: [Candle]) -> Double? {
        latestSwingLow(beforeLastCandleIn: fiveMinuteCandles)?.price
    }

    static func nearestSwingHighAbovePricePublic(fiveMinuteCandles: [Candle], price: Double) -> Double? {
        nearestSwingHighAbovePrice(in: fiveMinuteCandles, price: price)?.price
    }

    private static func swingHighs(in candles: [Candle], radius: Int = 4) -> [SwingPoint] {
        guard candles.count >= radius * 2 + 1 else { return [] }
        var result: [SwingPoint] = []

        for index in radius..<(candles.count - radius) {
            let high = candles[index].high
            let nearby = (index - radius)...(index + radius)
            let isSwing = nearby.allSatisfy { nearbyIndex in
                nearbyIndex == index || high > candles[nearbyIndex].high
            }
            if isSwing {
                result.append(SwingPoint(index: index, price: high))
            }
        }

        return result
    }

    private static func swingLows(in candles: [Candle], radius: Int = 4) -> [SwingPoint] {
        guard candles.count >= radius * 2 + 1 else { return [] }
        var result: [SwingPoint] = []

        for index in radius..<(candles.count - radius) {
            let low = candles[index].low
            let nearby = (index - radius)...(index + radius)
            let isSwing = nearby.allSatisfy { nearbyIndex in
                nearbyIndex == index || low < candles[nearbyIndex].low
            }
            if isSwing {
                result.append(SwingPoint(index: index, price: low))
            }
        }

        return result
    }

    private static func atrRatio(for candles: [Candle]) -> Double? {
        let values = atrValues(for: candles, period: 14).compactMap { $0 }
        guard let current = values.last, current > 0 else { return nil }
        let baseline = Array(values.suffix(100))
        guard let median = median(baseline), median > 0 else { return nil }
        return current / median
    }

    private static func atrValues(for candles: [Candle], period: Int) -> [Double?] {
        guard candles.count > period else {
            return Array(repeating: nil, count: candles.count)
        }

        var trueRanges = Array<Double>(repeating: 0, count: candles.count)
        for index in candles.indices {
            if index == 0 {
                trueRanges[index] = candles[index].high - candles[index].low
            } else {
                let highLow = candles[index].high - candles[index].low
                let highPreviousClose = abs(candles[index].high - candles[index - 1].close)
                let lowPreviousClose = abs(candles[index].low - candles[index - 1].close)
                trueRanges[index] = max(highLow, highPreviousClose, lowPreviousClose)
            }
        }

        var result = Array<Double?>(repeating: nil, count: candles.count)
        for index in (period - 1)..<trueRanges.count {
            let window = trueRanges[(index - period + 1)...index]
            result[index] = window.reduce(0, +) / Double(period)
        }
        return result
    }

    private static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let middle = sorted.count / 2
        if sorted.count.isMultiple(of: 2) {
            return (sorted[middle - 1] + sorted[middle]) / 2
        }
        return sorted[middle]
    }

    // MARK: - Market Regime Detection

    private static func detectMarketRegime(
        atrRatio: Double?,
        fifteenMinuteStructure: MarketStructure,
        fiveMinuteCandles: [Candle],
        price: Double,
        fifteenMinute: IndicatorSnapshot
    ) -> MarketRegime {
        // Quiet: very low volatility
        if let ratio = atrRatio, ratio < 0.5 {
            return .quiet
        }

        // Volatile/Choppy: extreme volatility
        if let ratio = atrRatio, ratio > 3.0 {
            return .volatile_chop
        }

        // Ranging: price bouncing between support and resistance without clear HH/HL or LH/LL
        let isTrending = fifteenMinuteStructure.isBullish || fifteenMinuteStructure.isBearish
        let emaSpread: Double
        if let ema9 = fifteenMinute.ema9, let ema50 = fifteenMinute.ema50, ema50 > 0 {
            emaSpread = abs(ema9 - ema50) / ema50
        } else {
            emaSpread = 0
        }

        // If EMAs are flat (spread < 0.003 = 0.3%) and no clear structure, market is ranging
        if !isTrending && emaSpread < 0.003 {
            return .ranging
        }

        // If ATR ratio is in the choppy zone (2.5-3.0), call it volatile
        if let ratio = atrRatio, ratio > 2.5 {
            return .volatile_chop
        }

        // If structure is clear and ATR is reasonable, trending
        if isTrending {
            return .trending
        }

        // Default: ranging if no clear trend
        return .ranging
    }

    // MARK: - Trailing Stop Calculation

    private static func calculateTrailingStop(
        price: Double,
        entryPrice: Double,
        stopLoss: Double,
        breakevenPrice: Double,
        target1: Double,
        target2: Double,
        fiveMinuteSwingLow: SwingPoint?,
        fiveMinuteEMA9: Double?,
        hasActivePosition: Bool
    ) -> TrailingStopState {
        var state = TrailingStopState()

        guard hasActivePosition, price > entryPrice else {
            return state
        }

        // Once price reaches Target 1, move stop to breakeven
        if price >= target1 {
            state.target1Hit = true
            state.movedToBreakeven = true
            state.activeTrailingStop = breakevenPrice
        }

        // Once Target 1 is hit, trail behind EMA9 or recent swing low
        if state.target1Hit {
            let ema9Stop = fiveMinuteEMA9 ?? price * 0.995
            let swingLowStop = fiveMinuteSwingLow?.price ?? price * 0.99

            // Use the higher of EMA9 or swing low as the trailing stop
            let trailingCandidate = max(ema9Stop, swingLowStop)

            // Only move the stop up, never down
            if trailingCandidate > (state.activeTrailingStop ?? 0) {
                state.activeTrailingStop = trailingCandidate
            }
        }

        return state
    }

    // MARK: - Normal/Pro Confluence Check

    private static func checkConfluence(normalScore: Int, proScore: Int) -> String? {
        // Strong disagreement: Normal says buy but Pro says no trade
        if normalScore >= 75 && proScore < 60 {
            return "Normal signal says buy but Pro signal disagrees — be cautious"
        }
        // Strong disagreement: Pro says buy but Normal says no trade
        if proScore >= 75 && normalScore < 60 {
            return "Pro signal says buy but Normal signal disagrees — mixed evidence"
        }
        // Moderate disagreement
        if abs(normalScore - proScore) >= 30 {
            return "Normal and Pro signals differ significantly — wait for clarity"
        }
        return nil
    }
}
