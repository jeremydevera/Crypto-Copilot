import Foundation

enum BackendMarketError: LocalizedError {
    case invalidURL
    case requestFailed(String)
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Unable to create backend API URL."
        case .requestFailed(let message):
            return message
        case .invalidPayload:
            return "Backend returned market data in an unexpected format."
        }
    }
}

enum BackendMarketService {
    static var baseURL = URL(
        string: ProcessInfo.processInfo.environment["CRYPTO_COPILOT_API_URL"]
            ?? "https://trading-copilot-backend-1p9r.onrender.com"
    )!

    /// Dedicated session with longer timeout for Render free tier (30-60s cold start)
    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()

    static func fetchSignal(
        symbol: String,
        mode: String = "pro",
        investmentAmount: Double,
        demoBalance: Double,
        riskPercent: Double = 1,
        feeAndSpreadPercent: Double = SignalEngine.defaultFeeAndSpreadPercent
    ) async throws -> TradingSignal {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/signal/\(symbol)"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "mode", value: mode),
            URLQueryItem(name: "investment", value: String(investmentAmount)),
            URLQueryItem(name: "demoBalance", value: String(demoBalance)),
            URLQueryItem(name: "riskPercent", value: String(riskPercent)),
            URLQueryItem(name: "feeAndSpread", value: String(feeAndSpreadPercent))
        ]

        let dto: BackendSignalDTO = try await fetchJSON(components?.url)
        return dto.toTradingSignal()
    }

    static func fetchCachedSignal(
        symbol: String
    ) async throws -> TradingSignal {
        let dto: BackendSignalDTO = try await fetchJSON(
            baseURL.appendingPathComponent("/api/cached-signal/\(symbol)")
        )
        return dto.toTradingSignal()
    }

    static func fetchCandles(
        symbol: String,
        timeframe: Timeframe,
        limit: Int = 200
    ) async throws -> [Candle] {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/candles/\(symbol)"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "interval", value: timeframe.rawValue),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        let dto: BackendCandlesDTO = try await fetchJSON(components?.url)
        return dto.candles.map(\.candle)
    }

    static func fetchPrice(symbol: String) async throws -> Double {
        let dto: BackendPriceDTO = try await fetchJSON(baseURL.appendingPathComponent("/api/price/\(symbol)"))
        return dto.price
    }

    private static func fetchJSON<T: Decodable>(_ url: URL?) async throws -> T {
        guard let url else { throw BackendMarketError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await session.data(for: request)
        if let response = response as? HTTPURLResponse, !(200...299).contains(response.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw BackendMarketError.requestFailed("Backend HTTP \(response.statusCode): \(body)")
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw BackendMarketError.invalidPayload
        }
    }
}

private struct BackendCandlesDTO: Decodable {
    let candles: [BackendCandleDTO]
}

private struct BackendCandleDTO: Decodable {
    let openTime: Double
    let closeTime: Double?
    let open: Double
    let high: Double
    let low: Double
    let close: Double
    let volume: Double
    let isClosed: Bool?

    var candle: Candle {
        Candle(
            openTime: Date(timeIntervalSince1970: openTime / 1000),
            closeTime: closeTime.map { Date(timeIntervalSince1970: $0 / 1000) },
            open: open,
            high: high,
            low: low,
            close: close,
            volume: volume,
            isClosed: isClosed
        )
    }
}

private struct BackendPriceDTO: Decodable {
    let price: Double
}

private struct BackendSignalDTO: Decodable {
    let symbol: String
    let price: Double
    let decision: String
    let risk: String
    let buyScore: BackendBuyScoreDTO
    let normalBuyScore: NormalScoreBreakdownDTO
    let sellScoreBreakdown: SellScoreBreakdownDTO
    let sellScore: Int
    let entryPrice: Double
    let breakevenPrice: Double
    let stopLoss: Double
    let target1: Double
    let target2: Double
    let rewardRisk: Double
    let suggestedPositionSize: Double
    let suggestedPositionValue: Double
    let accountRiskAmount: Double
    let accountRiskPercent: Double
    let positionRiskPercent: Double
    let reasons: [String]
    let warnings: [String]
    let fiveMinute: IndicatorSnapshotDTO
    let fifteenMinute: IndicatorSnapshotDTO
    let marketState: String?
    let marketRegime: String?
    let setupType: String?
    let backtest: BacktestDTO?
    let trailingStop: TrailingStopDTO?
    let confluenceWarning: String?

    func toTradingSignal() -> TradingSignal {
        TradingSignal(
            symbol: symbol,
            price: price,
            decision: SignalDecision(rawValue: decision) ?? .wait,
            risk: RiskLevel(rawValue: risk) ?? .medium,
            buyScore: buyScore.scoreBreakdown,
            normalBuyScore: normalBuyScore.value,
            sellScoreBreakdown: sellScoreBreakdown.value,
            sellScore: sellScore,
            entryPrice: entryPrice,
            breakevenPrice: breakevenPrice,
            stopLoss: stopLoss,
            target1: target1,
            target2: target2,
            rewardRisk: rewardRisk,
            suggestedPositionSize: suggestedPositionSize,
            suggestedPositionValue: suggestedPositionValue,
            accountRiskAmount: accountRiskAmount,
            accountRiskPercent: accountRiskPercent,
            positionRiskPercent: positionRiskPercent,
            reasons: reasons,
            warnings: warnings,
            fiveMinute: fiveMinute.value,
            fifteenMinute: fifteenMinute.value,
            marketState: marketState ?? "Trending",
            marketRegime: MarketRegime(rawValue: marketRegime ?? "") ?? .trending,
            setupType: setupType ?? "Backend Signal",
            backtest: backtest?.value ?? .unavailable,
            trailingStop: trailingStop?.value ?? TrailingStopState(),
            confluenceWarning: confluenceWarning
        )
    }
}

private struct BackendBuyScoreDTO: Decodable {
    let higherTimeframeBias: Int
    let marketStructure: Int
    let liquidity: Int
    let volatilitySession: Int
    let riskReward: Int
    let indicatorConfirmation: Int

    var scoreBreakdown: ScoreBreakdown {
        ScoreBreakdown(
            trend: 0,
            entry: 0,
            momentum: 0,
            volume: 0,
            riskReward: 0,
            supportResistance: 0,
            marketStructure: min(20, Int(round(Double(higherTimeframeBias + marketStructure) * 20.0 / 50.0))),
            liquidity: min(20, Int(round(Double(liquidity) * 20.0 / 15.0))),
            volatility: min(15, volatilitySession),
            session: 0,
            entryConfirmation: min(15, indicatorConfirmation * 3),
            riskManagement: min(20, Int(round(Double(riskReward) * 20.0 / 15.0)))
        )
    }
}

private struct NormalScoreBreakdownDTO: Decodable {
    let trend: Int
    let momentum: Int
    let volume: Int
    let entry: Int
    let riskReward: Int

    var value: NormalScoreBreakdown {
        NormalScoreBreakdown(trend: trend, momentum: momentum, volume: volume, entry: entry, riskReward: riskReward)
    }
}

private struct SellScoreBreakdownDTO: Decodable {
    let structureWeakness: Int
    let liquidityRejection: Int
    let momentumWeakness: Int
    let volatilityRisk: Int
    let exitRisk: Int

    var value: SellScoreBreakdown {
        SellScoreBreakdown(
            structureWeakness: structureWeakness,
            liquidityRejection: liquidityRejection,
            momentumWeakness: momentumWeakness,
            volatilityRisk: volatilityRisk,
            exitRisk: exitRisk
        )
    }
}

private struct IndicatorSnapshotDTO: Decodable {
    let ema9: Double?
    let ema21: Double?
    let ema50: Double?
    let rsi14: Double?
    let previousRSI14: Double?
    let macd: Double?
    let macdSignal: Double?
    let previousMACD: Double?
    let previousMACDSignal: Double?
    let averageVolume20: Double?
    let currentVolume: Double?
    let support: Double?
    let resistance: Double?

    var value: IndicatorSnapshot {
        IndicatorSnapshot(
            ema9: ema9,
            ema21: ema21,
            ema50: ema50,
            rsi14: rsi14,
            previousRSI14: previousRSI14,
            macd: macd,
            macdSignal: macdSignal,
            previousMACD: previousMACD,
            previousMACDSignal: previousMACDSignal,
            averageVolume20: averageVolume20,
            currentVolume: currentVolume,
            support: support,
            resistance: resistance
        )
    }
}

private struct BacktestDTO: Decodable {
    let probability: Double?
    let wins: Int
    let total: Int
    let expectedValueR: Double?

    var value: BacktestEstimate {
        BacktestEstimate(probability: probability, wins: wins, total: total, expectedValueR: expectedValueR)
    }
}

private struct TrailingStopDTO: Decodable {
    let activeTrailingStop: Double?
    let target1Hit: Bool
    let movedToBreakeven: Bool

    var value: TrailingStopState {
        TrailingStopState(
            activeTrailingStop: activeTrailingStop,
            target1Hit: target1Hit,
            movedToBreakeven: movedToBreakeven
        )
    }
}
