import Foundation

enum Timeframe: String, CaseIterable, Identifiable {
    case oneSecond = "1s"
    case oneMinute = "1m"
    case fiveMinutes = "5m"
    case fifteenMinutes = "15m"
    case oneHour = "1h"
    case fourHours = "4h"
    case oneDay = "1d"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .oneSecond: return "1s"
        case .oneMinute: return "1m"
        case .fiveMinutes: return "5m"
        case .fifteenMinutes: return "15m"
        case .oneHour: return "1h"
        case .fourHours: return "4H"
        case .oneDay: return "1D"
        }
    }
}

struct Candle: Identifiable, Equatable {
    let openTime: Date
    let open: Double
    var high: Double
    var low: Double
    var close: Double
    var volume: Double

    var id: Date { openTime }
}

struct IndicatorSnapshot: Equatable {
    var ema9: Double?
    var ema21: Double?
    var ema50: Double?
    var rsi14: Double?
    var previousRSI14: Double?
    var macd: Double?
    var macdSignal: Double?
    var previousMACD: Double?
    var previousMACDSignal: Double?
    var averageVolume20: Double?
    var currentVolume: Double?
    var support: Double?
    var resistance: Double?

    var isRSIRising: Bool {
        guard let rsi14, let previousRSI14 else { return false }
        return rsi14 > previousRSI14
    }

    var isMACDBullish: Bool {
        guard let macd, let macdSignal else { return false }
        return macd > macdSignal
    }

    var isMACDBearish: Bool {
        guard let macd, let macdSignal else { return false }
        return macd < macdSignal
    }

    var volumeAboveAverage: Bool {
        guard let currentVolume, let averageVolume20 else { return false }
        return currentVolume > averageVolume20
    }

    var volumeRatio: Double? {
        guard let currentVolume, let averageVolume20, averageVolume20 > 0 else { return nil }
        return currentVolume / averageVolume20
    }
}

// Holds ALL variables so the UI never crashes
struct ScoreBreakdown: Equatable {
    // Normal Metrics
    var trend: Int = 0
    var entry: Int = 0
    var momentum: Int = 0
    var volume: Int = 0
    var riskReward: Int = 0
    var supportResistance: Int = 0
    
    // Pro Metrics
    var marketStructure: Int = 0
    var liquidity: Int = 0
    var volatility: Int = 0
    var session: Int = 0
    var entryConfirmation: Int = 0
    var riskManagement: Int = 0

    var total: Int {
        trend + entry + momentum + volume + riskReward + supportResistance + marketStructure + liquidity + volatility + session + entryConfirmation + riskManagement
    }
}

struct NormalScoreBreakdown: Equatable {
    var trend: Int = 0
    var momentum: Int = 0
    var volume: Int = 0
    var entry: Int = 0
    var riskReward: Int = 0

    var total: Int {
        trend + momentum + volume + entry + riskReward
    }
}

struct SellScoreBreakdown: Equatable {
    var structureWeakness: Int = 0
    var liquidityRejection: Int = 0
    var momentumWeakness: Int = 0
    var volatilityRisk: Int = 0
    var exitRisk: Int = 0

    var total: Int {
        structureWeakness + liquidityRejection + momentumWeakness + volatilityRisk + exitRisk
    }
}

enum MarketRegime: String, Equatable {
    case trending = "Trending"
    case ranging = "Ranging"
    case volatile_chop = "Volatile / Choppy"
    case quiet = "Quiet / Low Activity"
}

struct TrailingStopState: Equatable {
    var activeTrailingStop: Double?
    var target1Hit: Bool = false
    var movedToBreakeven: Bool = false
}

struct BacktestEstimate: Equatable {
    var probability: Double?
    var wins: Int = 0
    var total: Int = 0
    var expectedValueR: Double?

    static let unavailable = BacktestEstimate(
        probability: nil,
        wins: 0,
        total: 0,
        expectedValueR: nil
    )
}

typealias BacktestMetrics = BacktestEstimate

struct BookTicker: Equatable {
    var symbol: String
    var bidPrice: Double
    var bidQuantity: Double
    var askPrice: Double
    var askQuantity: Double

    var spread: Double? {
        guard askPrice > 0, bidPrice > 0 else { return nil }
        return askPrice - bidPrice
    }

    var midPrice: Double? {
        guard askPrice > 0, bidPrice > 0 else { return nil }
        return (askPrice + bidPrice) / 2
    }

    var spreadPercent: Double? {
        guard let spread, let midPrice, midPrice > 0 else { return nil }
        return spread / midPrice * 100
    }
}

struct OrderBookLevel: Equatable {
    var price: Double
    var quantity: Double

    var notional: Double {
        price * quantity
    }
}

struct OrderBookSnapshot: Equatable {
    var lastUpdateId: Int
    var bids: [OrderBookLevel]
    var asks: [OrderBookLevel]

    var topBidNotional: Double {
        bids.reduce(0) { $0 + $1.notional }
    }

    var topAskNotional: Double {
        asks.reduce(0) { $0 + $1.notional }
    }

    var bidAskImbalance: Double? {
        let total = topBidNotional + topAskNotional
        guard total > 0 else { return nil }
        return (topBidNotional - topAskNotional) / total
    }
}

struct MarketMicrostructure: Equatable {
    var bookTicker: BookTicker?
    var orderBook: OrderBookSnapshot?

    static let empty = MarketMicrostructure()

    var spreadPercent: Double? {
        bookTicker?.spreadPercent
    }

    var depthImbalance: Double? {
        orderBook?.bidAskImbalance
    }
}

enum DataFreshness: Equatable {
    case connecting
    case live(delay: TimeInterval)
    case delayed(delay: TimeInterval)
    case stale(delay: TimeInterval)
    case offline

    var label: String {
        switch self {
        case .connecting: return "Connecting..."
        case .live(let delay): return "Live \(String(format: "%.0fs", delay))"
        case .delayed(let delay): return "\(String(format: "%.0fs", delay)) delay"
        case .stale(let delay): return "\(String(format: "%.0fs", delay)) stale"
        case .offline: return "Offline"
        }
    }

    var color: String {
        switch self {
        case .connecting: return "orange"
        case .live: return "green"
        case .delayed: return "yellow"
        case .stale: return "orange"
        case .offline: return "red"
        }
    }
}

enum SignalDecision: String {
    case strongBuy = "Strong Buy"
    case considerBuy = "Consider Buy"
    case wait = "Wait"
    case noTrade = "No Trade"
    case hold = "Hold"
    case considerSell = "Consider Sell"
    case sellExit = "Sell / Exit"

    var isBuyLeaning: Bool {
        self == .strongBuy || self == .considerBuy
    }
}

enum RiskLevel: String {
    case low = "Low"
    case medium = "Medium"
    case high = "High"
}

struct TradingSignal: Equatable {
    var symbol: String
    var price: Double
    var decision: SignalDecision
    var risk: RiskLevel
    
    // Separated Scores
    var buyScore: ScoreBreakdown
    var normalBuyScore: NormalScoreBreakdown
    var sellScoreBreakdown: SellScoreBreakdown
    
    var sellScore: Int
    var entryPrice: Double
    var breakevenPrice: Double
    var stopLoss: Double
    var target1: Double
    var target2: Double
    var rewardRisk: Double
    var suggestedPositionSize: Double
    var suggestedPositionValue: Double
    var accountRiskAmount: Double
    var accountRiskPercent: Double
    var positionRiskPercent: Double
    var reasons: [String]
    var warnings: [String]
    var fiveMinute: IndicatorSnapshot
    var fifteenMinute: IndicatorSnapshot
    
    var marketState: String = "Trending"
    var marketRegime: MarketRegime = .trending
    var setupType: String = "Pullback"
    var backtest: BacktestEstimate = .unavailable
    var trailingStop: TrailingStopState = TrailingStopState()
    var confluenceWarning: String? = nil

    static let placeholder = TradingSignal(
        symbol: "BTCUSDT",
        price: 0,
        decision: .wait,
        risk: .medium,
        buyScore: ScoreBreakdown(),
        normalBuyScore: NormalScoreBreakdown(),
        sellScoreBreakdown: SellScoreBreakdown(),
        sellScore: 0,
        entryPrice: 0,
        breakevenPrice: 0,
        stopLoss: 0,
        target1: 0,
        target2: 0,
        rewardRisk: 0,
        suggestedPositionSize: 0,
        suggestedPositionValue: 0,
        accountRiskAmount: 0,
        accountRiskPercent: 0,
        positionRiskPercent: 1,
        reasons: ["Waiting for market data"],
        warnings: [],
        fiveMinute: IndicatorSnapshot(),
        fifteenMinute: IndicatorSnapshot()
    )
}

struct TradeQuote: Equatable {
    var investmentAmount: Double
    var entryPrice: Double
    var feeAndSpreadPercent: Double
    var slippagePercent: Double
    var breakevenPrice: Double
    var target1: Double
    var target2: Double
    var stopLoss: Double
    var rewardRisk: Double
}

struct PaperPosition: Identifiable, Equatable, Codable {
    let id: UUID
    let symbol: String
    let entryDate: Date
    let entryPrice: Double
    let investedAmount: Double
    let buyFee: Double
    var quantity: Double
    var remainingQuantity: Double

    var costBasis: Double {
        investedAmount
    }

    enum CodingKeys: String, CodingKey {
        case id, symbol, entryDate, entryPrice, investedAmount, buyFee, quantity, remainingQuantity
    }

    init(id: UUID, symbol: String, entryDate: Date, entryPrice: Double, investedAmount: Double, buyFee: Double, quantity: Double, remainingQuantity: Double? = nil) {
        self.id = id
        self.symbol = symbol
        self.entryDate = entryDate
        self.entryPrice = entryPrice
        self.investedAmount = investedAmount
        self.buyFee = buyFee
        self.quantity = quantity
        self.remainingQuantity = remainingQuantity ?? quantity
    }
}

struct ClosedPaperTrade: Identifiable, Equatable, Codable {
    let id: UUID
    let symbol: String
    let entryDate: Date
    let exitDate: Date
    let entryPrice: Double
    let exitPrice: Double
    let investedAmount: Double
    let buyFee: Double
    let sellFee: Double
    let quantity: Double
    let profit: Double

    var profitPercent: Double {
        guard investedAmount > 0 else { return 0 }
        return profit / investedAmount * 100
    }
}
