import SwiftUI
import AudioToolbox
import UserNotifications

// Forces iOS to show push notifications even when the app is open
class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    
    func setup() {
        UNUserNotificationCenter.current().delegate = self
    }
    
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

// Extension to dismiss the keyboard when tapping anywhere
extension View {
    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// Dynamic Palette
private let themeBackground = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1) : UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1) })
private let themePanel = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0.16, green: 0.16, blue: 0.18, alpha: 1) : UIColor.white })
private let themeSurface = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0.22, green: 0.22, blue: 0.24, alpha: 1) : UIColor(red: 0.90, green: 0.90, blue: 0.92, alpha: 1) })
private let themeLine = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0.32, green: 0.32, blue: 0.36, alpha: 1) : UIColor(red: 0.85, green: 0.85, blue: 0.88, alpha: 1) })
private let themeText = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(white: 0.92, alpha: 1) : UIColor(white: 0.1, alpha: 1) })
private let themeComment = Color(UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0.53, green: 0.58, blue: 0.64, alpha: 1) : UIColor(red: 0.45, green: 0.5, blue: 0.55, alpha: 1) })
private let themeGreen = Color(red: 0.1, green: 0.8, blue: 0.2)
private let themePink = Color(red: 1.0, green: 0.15, blue: 0.15)
private let themeYellow = Color(red: 0.90, green: 0.82, blue: 0.45)
private let themeOrange = Color(red: 1.0, green: 0.62, blue: 0.0)
private let themePurple = Color(red: 0.76, green: 0.60, blue: 0.98)
private let themeBlue = Color(red: 0.40, green: 0.80, blue: 1.0)

// Formatters
private let usdFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencySymbol = "$"
    formatter.maximumFractionDigits = 2
    formatter.minimumFractionDigits = 2
    return formatter
}()

private let phpFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencySymbol = "₱"
    formatter.maximumFractionDigits = 2
    formatter.minimumFractionDigits = 2
    return formatter
}()

private func usdValue(_ number: Double?) -> String {
    guard let number = number else { return "--" }
    return usdFormatter.string(from: NSNumber(value: number)) ?? "$0.00"
}

private func phpValue(_ number: Double?) -> String {
    guard let number = number else { return "--" }
    return phpFormatter.string(from: NSNumber(value: number)) ?? "₱0.00"
}

private func btcQuantityValue(_ number: Double?) -> String {
    guard let number = number else { return "--" }
    return "\(number.formatted(.number.precision(.fractionLength(0...8)))) BTC"
}

private func formatToTwoDecimals(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 2
    formatter.minimumFractionDigits = 0
    formatter.usesGroupingSeparator = false
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}

private struct HelpTopic: Identifiable, Equatable {
    let id: String
    let title: String
    let explanation: String
    let example: String
    let calcEffect: String
}

private extension HelpTopic {
    static let demoBalance = HelpTopic(id: "demoBalance", title: "Demo Balance", explanation: "This is fake money for practice. It's not real. Use it to test if the signals work before risking real money.", example: "If you start with ₱100,000 and buy ₱10,000 worth of BTC, your balance drops to ₱90,000 until you sell.", calcEffect: "This number decides how big your position size can be. The app risks only 1% of this balance per trade, so a bigger balance = bigger position.")
    static let investAmount = HelpTopic(id: "investAmount", title: "Invest Amount", explanation: "How much of your demo money you want to put into one trade. Think of it as your bet size.", example: "If you type ₱5,000 and BTC is at $80,000, the app pretends you bought ₱5,000 worth of BTC.", calcEffect: "This sets the dollar amount for the trade. The app subtracts fees from this, then buys as much BTC as possible with what's left.")
    static let feesSpread = HelpTopic(id: "feesSpread", title: "Fees + Spread", explanation: "Trading costs money. The exchange charges a fee, and there's also a tiny gap between buy and sell prices called the spread.", example: "If you buy at $80,000 and the total cost is 0.5%, you need BTC to go above $80,400 just to break even.", calcEffect: "This percentage is added to your entry price to calculate breakeven. Higher fees = higher breakeven price = harder to profit. The app uses 0.1% for fees + 0.05% for slippage.")
    static let entry = HelpTopic(id: "entry", title: "Entry Price", explanation: "The price where your trade starts. If you haven't bought yet, it's the current BTC price. If you already bought, it's your actual buy price.", example: "If you buy BTC at $80,000, that's your entry. Everything — targets, stop loss, breakeven — is measured from this number.", calcEffect: "All targets and stop loss are calculated from this price. When you have an open position, the app uses your actual buy price instead of the current price.")
    static let breakeven = HelpTopic(id: "breakeven", title: "Breakeven", explanation: "The exact price where you make zero profit and zero loss after fees. Above this price, you're winning. Below it, you're losing.", example: "Entry at $80,000 with 0.5% total cost means breakeven is around $80,400. BTC needs to go above $80,400 for you to profit.", calcEffect: "Breakeven = Entry Price × (1 + Fees%). This is the minimum price you need to sell at to not lose money.")
    static let target1 = HelpTopic(id: "target1", title: "Target 1", explanation: "The first price level where you can take some profit. It's closer and safer than Target 2.", example: "If entry is $80,000, Target 1 might be the nearest swing high around $81,200. You can sell 50% of your position here.", calcEffect: "The app finds the nearest swing high above entry + 0.5%. If no swing high is found, it falls back to Entry × 1.015 (1.5% above entry). When price hits Target 1, the trailing stop moves to breakeven.")
    static let target2 = HelpTopic(id: "target2", title: "Target 2", explanation: "The bigger profit goal. It's further away so it's harder to reach, but the reward is bigger.", example: "If entry is $80,000, Target 2 might be the next swing high around $82,400. This is where you'd sell the rest.", calcEffect: "The app finds the next swing high above Target 1. If none is found, it falls back to Entry × 1.03 (3% above entry). This is used in the reward/risk ratio calculation.")
    static let stopLoss = HelpTopic(id: "stopLoss", title: "Stop Loss", explanation: "Your emergency exit price. If BTC drops to this level, the trade is probably wrong and you should get out before losing more.", example: "If entry is $80,000 and stop loss is $78,800, you exit if BTC falls to $78,800. Your maximum loss is the difference.", calcEffect: "The app places stop loss just below the nearest swing low (with 0.1% buffer). If no swing low is found, it falls back to Entry × 0.985 (1.5% below entry). This sets your risk amount for position sizing.")
    static let openProfit = HelpTopic(id: "openProfit", title: "Open P/L", explanation: "How much money your current trade is making or losing right now, including fees and slippage.", example: "If you bought at $80,000 and BTC is now $81,000, your P/L is green. If BTC dropped to $79,000, it's red.", calcEffect: "Formula: (Current Price × remaining quantity × (1 - slippage%)) - fees - cost basis. This uses your remaining quantity if you did a partial sell.")
    static let rewardRisk = HelpTopic(id: "rewardRisk", title: "Reward/Risk", explanation: "A ratio comparing how much you could win vs how much you could lose. Higher is better.", example: "2:1 means you risk losing ₱1 to potentially gain ₱2. A 3:1 ratio is even better.", calcEffect: "Calculated as (Target 1 - Entry) ÷ (Entry - Stop Loss). The app needs at least 1.5:1 to consider a buy. This ratio directly affects the buy score's Risk/Reward category (max 15 points).")
    static let positionSize = HelpTopic(id: "positionSize", title: "Position Size", explanation: "How much BTC the app suggests you should buy, based on how much you're willing to risk.", example: "If you risk ₱1,000 and the distance from entry to stop loss is $1,200 per BTC, the app suggests buying about 0.00083 BTC.", calcEffect: "Formula: (Account Risk Amount) ÷ (Entry - Stop Loss). Account Risk = 1% of your demo balance. This keeps each trade's risk small and consistent.")
    static let ema9 = HelpTopic(id: "ema9", title: "EMA 9", explanation: "A fast-moving line that follows BTC price closely. It shows what price has been doing in the last 45 minutes (9 candles × 5 min).", example: "If BTC price is above EMA 9, short-term buyers are in control. If price drops below EMA 9, sellers might be taking over.", calcEffect: "Used in 3 places: (1) Trend score — price above EMA 9 adds points, (2) Entry Confirmation — price near EMA 9 is a good entry, (3) Trailing Stop — once Target 1 is hit, the stop trails behind EMA 9.")
    static let ema21 = HelpTopic(id: "ema21", title: "EMA 21", explanation: "A medium-speed line showing the average price over the last 105 minutes (21 candles × 5 min). It's a common pullback zone.", example: "In an uptrend, BTC often dips to EMA 21 and bounces back up. That bounce is a good time to buy.", calcEffect: "Used in 4 places: (1) Trend score — EMA 9 above EMA 21 adds 15 points, (2) Entry Confirmation — price near EMA 21 adds points, (3) Sell score — price below EMA 21 adds sell points, (4) 15-minute trend check.")
    static let ema50 = HelpTopic(id: "ema50", title: "EMA 50", explanation: "A slow line showing the average price over the last 250 minutes (about 4 hours). It tells you the big picture trend.", example: "If BTC is above EMA 50, the overall trend is up. If below, the trend is down. Buy setups work better above EMA 50.", calcEffect: "Used in 2 places: (1) Trend score — price above EMA 50 adds 15 points, (2) Market Regime — if EMA 9 is far above EMA 50, the app detects a strong trend.")
    static let rsi = HelpTopic(id: "rsi", title: "RSI 14", explanation: "A number from 0 to 100 that shows if BTC is overbought (too expensive, likely to drop) or oversold (too cheap, likely to bounce).", example: "RSI above 70 = overbought (might drop). RSI below 30 = oversold (might bounce). RSI between 45-65 = healthy momentum.", calcEffect: "Used in 4 places: (1) Momentum score — RSI 45-65 adds up to 10 points, (2) Sell score — RSI falling from overbought adds 7 sell points, (3) Entry Confirmation — rising RSI adds points, (4) Backtest filter.")
    static let macd = HelpTopic(id: "macd", title: "MACD", explanation: "A tool that shows if momentum is getting stronger (bullish) or weaker (bearish). Think of it as a speed gauge for price.", example: "MACD bullish = price is accelerating upward. MACD bearish = price is slowing down or dropping.", calcEffect: "Used in 3 places: (1) Momentum score — MACD bullish adds up to 10 points, (2) Sell score — MACD bearish adds 7 sell points, (3) Entry Confirmation — MACD bullish adds 5 points.")
    static let volume = HelpTopic(id: "volume", title: "Volume", explanation: "How much BTC is being traded. High volume means lots of people are buying and selling. Low volume means fewer people are participating.", example: "A price jump with high volume = many traders agree on the direction. A price jump with low volume = might be a fake move.", calcEffect: "Used in 2 places: (1) Volume score — current volume above 20-candle average adds up to 15 points, (2) Sell score — high volume on a bearish candle adds 6 sell points.")
    static let normalTrend = HelpTopic(id: "normalTrend", title: "Normal: 15m Trend", explanation: "Checks if the bigger picture trend is up. It looks at the 15-minute chart to see if BTC is above the important moving averages.", example: "Price above EMA 50 on the 15-minute chart = 15 points. EMA 9 above EMA 21 = another 15 points. Max 30 points.", calcEffect: "This is 30 out of 100 points in the Normal score. It checks two things on the 15-minute chart: (1) Is price above EMA 50? +15 pts, (2) Is EMA 9 above EMA 21? +15 pts.")
    static let normalMomentum = HelpTopic(id: "normalMomentum", title: "Normal: Momentum", explanation: "Checks if price strength is improving. It looks at RSI and MACD to see if buyers are getting stronger.", example: "RSI between 45-65 and rising, plus MACD bullish = full 25 points. Weak momentum = fewer points.", calcEffect: "This is 25 out of 100 points. RSI in the sweet spot (45-65) adds up to 10 pts, RSI rising adds 5 pts, MACD bullish adds up to 10 pts.")
    static let normalVolume = HelpTopic(id: "normalVolume", title: "Normal: Volume", explanation: "Checks if the current trading activity is above average. More activity = more believable price moves.", example: "Current volume above the 20-candle average = full 15 points. Below average = 0 points.", calcEffect: "This is 15 out of 100 points. If current volume is above the 20-candle average, you get all 15 points. Otherwise 0.")
    static let normalEntry = HelpTopic(id: "normalEntry", title: "Normal: 5m Entry", explanation: "Checks if the current 5-minute candle looks like a good time to enter. It wants to see signs that buyers are stepping in right now.", example: "Price near EMA 21, green candle, and breaking the previous candle high = strong entry. Max 15 points.", calcEffect: "This is 15 out of 100 points. Price within 0.3% of EMA 21 adds 5 pts, green candle adds 5 pts, breaking previous high adds 5 pts.")
    static let normalRiskReward = HelpTopic(id: "normalRiskReward", title: "Normal: Risk/Reward", explanation: "Checks if the potential profit is worth the risk. You want to make more than you could lose.", example: "Risk ₱1 to make ₱2.5 = 2.5:1 ratio. The app needs at least 1.5:1 to pass. Max 15 points.", calcEffect: "This is 15 out of 100 points. Reward/Risk ≥ 3:1 = 15 pts, ≥ 2:1 = 12 pts, ≥ 1.5:1 = 8 pts, below 1.5:1 = 0 pts and the trade is blocked.")
    static let marketStructure = HelpTopic(id: "marketStructure", title: "Market Structure", explanation: "The shape of the price trend. For buying, the app wants to see higher highs and higher lows — that means buyers are winning.", example: "BTC goes $79,000 → $80,000 (higher high), dips to $79,500 (higher low), then pushes to $80,800. That's bullish structure.", calcEffect: "This is 20 out of 100 points in the Pro score. Checks: (1) Is the 15m trend up? +8 pts, (2) Is price making higher highs? +6 pts, (3) Is price making higher lows? +6 pts.")
    static let liquidity = HelpTopic(id: "liquidity", title: "Liquidity", explanation: "Areas where many traders likely placed stop orders. The app likes when price sweeps those areas and quickly recovers — it often means a reversal is starting.", example: "BTC dips below a recent low, triggers everyone's stop losses, then jumps back above. That's a liquidity sweep — a trap for sellers.", calcEffect: "This is 20 out of 100 points in the Pro score. Checks: (1) Did price sweep below a recent low? +10 pts, (2) Did it recover quickly? +5 pts, (3) Is there order book support? +5 pts.")
    static let volatility = HelpTopic(id: "volatility", title: "Volatility", explanation: "How much BTC is moving. Too calm = hard to profit. Too wild = dangerous. The sweet spot is moderate movement.", example: "A calm but steadily moving market is ideal. A flat chart means no profit opportunity. Wild spikes can hit your stop loss too fast.", calcEffect: "This is 15 out of 100 points in the Pro score. Uses ATR (Average True Range): moderate ATR = 15 pts, too low or too high = fewer points.")
    static let session = HelpTopic(id: "session", title: "Session Activity", explanation: "Checks if enough traders are active right now and the bid-ask spread is reasonable. More participants = cleaner price action.", example: "BTC moves more smoothly when many traders are active (like during US/Europe hours). Thin markets can have fake moves.", calcEffect: "This is 10 out of 100 points in the Pro score. Checks: (1) Is bid-ask spread tight? +5 pts, (2) Is there enough order book depth? +5 pts.")
    static let entryConfirmation = HelpTopic(id: "entryConfirmation", title: "Entry Confirmation", explanation: "Final checks before the app says 'buy'. It wants to see multiple signs that buyers are stepping in right now.", example: "RSI rising + MACD bullish + price above EMA 21 + green candle = strong confirmation. The more signs, the higher the score.", calcEffect: "This is 15 out of 100 points in the Pro score. Checks: (1) RSI rising? +3 pts, (2) MACD bullish? +5 pts, (3) Price above EMA 21? +4 pts, (4) Green candle? +3 pts.")
    static let riskManagement = HelpTopic(id: "riskManagement", title: "Risk Management", explanation: "Checks if the trade setup makes sense from a risk perspective. Even with a good chart, the app may reject a trade if the risk is too big.", example: "If the stop loss is too far from entry, or the reward/risk ratio is bad, the app blocks the trade to protect you.", calcEffect: "This is 20 out of 100 points in the Pro score. Checks: (1) Is risk per trade ≤ 1% of account? +5 pts, (2) Is reward/risk ≥ 2:1? +5 pts, (3) Is stop loss based on structure? +5 pts, (4) Is position size reasonable? +5 pts.")
    static let backtest = HelpTopic(id: "backtest", title: "Backtest Win Rate", explanation: "The app looks at past similar setups and checks: how often did this pattern work before? It's like checking the history of similar situations.", example: "If 7 out of 10 similar setups in the past made money, the backtest win rate is 70%. But past results don't guarantee future results.", calcEffect: "The app scans the last 240 candles for setups with a similar buy score (±10 points). It then checks if price reached the target before the stop loss. If the expected value is negative and buy score ≥ 75, the trade is blocked.")
    static let expectedValue = HelpTopic(id: "expectedValue", title: "Expected Value", explanation: "A math estimate of whether this setup is profitable over many trades. Positive = likely profitable. Negative = likely losing.", example: "If win rate is 60% and reward/risk is 2:1, expected value is positive. This means if you took 100 similar trades, you'd likely make money overall.", calcEffect: "Formula: (Win% × Reward) - (Loss% × Risk) - Fees. If expected value is negative and buy score ≥ 75, the trade is blocked as a hard filter.")
    static let sellScore = HelpTopic(id: "sellScore", title: "Sell Score", explanation: "A score out of 100 that shows reasons to exit your trade. Higher score = more warning signs that it's time to sell.", example: "If BTC hits resistance and MACD turns bearish, Sell Score might jump to 65/100, meaning 'consider selling'.", calcEffect: "When Sell Score ≥ 80, the app says 'SELL NOW'. When 65-79, it says 'Consider Selling'. Below 65, it says 'Hold'. This overrides the buy signal when you have an open position.")
    static let structureWeakness = HelpTopic(id: "structureWeakness", title: "Structure Weakness", explanation: "The price trend is breaking down. Lower highs or lower lows mean sellers are taking over.", example: "If BTC was making higher highs but now makes a lower high, that's structure weakness. The trend might be reversing.", calcEffect: "Max 25 points toward Sell Score. Checks: (1) 15m trend turning bearish? +8 pts, (2) Price making lower highs? +9 pts, (3) Price making lower lows? +8 pts.")
    static let liquidityRejection = HelpTopic(id: "liquidityRejection", title: "Liquidity Rejection", explanation: "Price tried to push above a key level but got rejected. This often means sellers are defending that level.", example: "BTC pushes to $81,000 but quickly drops back below — that's rejection. Buyers couldn't hold the higher price.", calcEffect: "Max 20 points toward Sell Score. Checks: (1) Large upper wick on the candle? +10 pts, (2) Price near a swing high? +5 pts, (3) Order book showing sell pressure? +5 pts.")
    static let momentumWeakness = HelpTopic(id: "momentumWeakness", title: "Momentum Weakness", explanation: "The buying pressure is fading. RSI is falling from overbought, or MACD is turning bearish.", example: "RSI was 75 and dropping, plus MACD just crossed bearish = momentum is weakening. The rally might be running out of steam.", calcEffect: "Max 20 points toward Sell Score. Checks: (1) RSI falling from overbought (>70)? +7 pts, (2) MACD bearish? +7 pts, (3) Bearish candle with high volume? +6 pts.")
    static let volatilityRisk = HelpTopic(id: "volatilityRisk", title: "Volatility Risk", explanation: "Price is moving too wildly. Wild moves can hit your stop loss before your target, even if you're right about the direction.", example: "If ATR (average movement) is 2.5× normal, the market is too unpredictable. It's safer to wait.", calcEffect: "Max 15 points toward Sell Score. Checks: (1) ATR ratio above 2.5? +8 pts, (2) Large bearish candle? +7 pts.")
    static let exitRisk = HelpTopic(id: "exitRisk", title: "Exit Risk", explanation: "Price is at or past your target, or has hit your stop loss. Time to take action.", example: "If price reached Target 1, that's +10 exit risk points. If price hit your stop loss, that's +20 — you should have already exited.", calcEffect: "Max 20 points toward Sell Score. Checks: (1) Price at or above Target 1? +10 pts, (2) Price at or below Stop Loss? +20 pts.")
    static let trailingStop = HelpTopic(id: "trailingStop", title: "Trailing Stop", explanation: "A stop loss that moves up as your trade makes progress. It locks in profit by following the price upward.", example: "You buy at $80,000 with stop at $78,800. Price hits Target 1 at $81,200 → stop moves to $80,000 (breakeven). Price keeps rising → stop follows EMA 9 upward.", calcEffect: "Once Target 1 is hit, the stop loss moves to your breakeven price (so you can't lose). Then it trails behind EMA 9 or the latest swing low, whichever is higher. This protects profits while giving the trade room to grow.")
    static let marketRegime = HelpTopic(id: "marketRegime", title: "Market Regime", explanation: "What kind of market we're in right now. Different strategies work better in different regimes.", example: "Trending = BTC is moving clearly in one direction (best for buy signals). Ranging = BTC is bouncing sideways (signals may fail). Volatile = wild swings (dangerous).", calcEffect: "The app detects 4 regimes: Trending (best for buy signals), Ranging (trend signals may fail — adds a warning), Volatile/Choppy (whipsaw risk — adds a warning), Quiet (low participation — adds a warning). This doesn't change scores but adds warnings to help you decide.")
    static let confluenceWarning = HelpTopic(id: "confluenceWarning", title: "Confluence Warning", explanation: "A warning when the Normal score and Pro score disagree. If one says 'buy' but the other says 'don't', be careful.", example: "Normal score is 80 (looks good) but Pro score is only 45 (structure is bad). The app warns you that the signals don't agree.", calcEffect: "If Normal score ≥ 70 but Pro score < 50, or vice versa, the app shows a confluence warning. This doesn't block trades but tells you to be extra cautious.")
}

private enum LaunchAuthMode {
    case signIn
    case signUp
}

struct ContentView: View {
    @StateObject private var viewModel = MarketViewModel()
    @StateObject private var supabase = SupabaseService.shared
    @State private var message: String?
    @State private var lastClosedTrade: ClosedPaperTrade?
    @State private var showDeleteConfirmation = false
    @State private var activeHelpTopic: HelpTopic?
    @State private var authMode: LaunchAuthMode = .signIn
    @State private var authEmail = ""
    @State private var authPassword = ""
    @State private var authDismissed = false
    
    @State private var selectedTab = 0
    @AppStorage("appTheme") private var appTheme = 1

    private var signal: TradingSignal { viewModel.activeSignal }
    private var store: PaperTradingStore { viewModel.paperTrading }
    private var quote: TradeQuote { viewModel.tradeQuote }
    
    private var chartCandles: [Candle] { viewModel.selectedChartCandles }

    private var demoBalance: Binding<Double> {
        Binding(get: { store.demoBalance }, set: { viewModel.setDemoBalance($0) })
    }
    
    private var activeColorScheme: ColorScheme? {
        switch appTheme {
        case 1: return .dark
        case 2: return .light
        default: return nil
        }
    }

    @ViewBuilder
    var body: some View {
        if supabase.isSignedIn || authDismissed {
            mainAppView
        } else {
            launchAuthView
        }
    }

    private var mainAppView: some View {
        TabView(selection: $selectedTab) {
            homeTab
                .tabItem {
                    Image(systemName: "house.fill")
                    Text("Home")
                }
                .tag(0)
            
            historyTab
                .tabItem {
                    Image(systemName: "clock.arrow.circlepath")
                    Text("History")
                }
                .tag(1)
            
            TutorialTab()
                .tabItem {
                    Image(systemName: "book.pages.fill")
                    Text("Tutorial")
                }
                .tag(2)
            
            SettingsTab(viewModel: viewModel)
                .tabItem {
                    Image(systemName: "gearshape.fill")
                    Text("Settings")
                }
                .tag(3)
                
            DevTerminalTab(wsLogs: viewModel.devLogs, restLogs: viewModel.restLogs, reconnect: { Task { await viewModel.reconnectAll() } })
                .tabItem {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("Dev")
                }
                .tag(4)
        }
        .tint(themeGreen)
        .preferredColorScheme(activeColorScheme)
        .task { viewModel.start() }
        .sheet(item: $activeHelpTopic) { topic in
            HomeHelpSheet(topic: topic) {
                activeHelpTopic = nil
                selectedTab = 2
            }
            .preferredColorScheme(activeColorScheme)
        }
    }

    private var launchAuthView: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 32)

            VStack(spacing: 8) {
                Text("Trading Copilot")
                    .font(.title.bold())
                    .foregroundStyle(themeText)
                Text("Sign in to sync your settings and paper trades.")
                    .font(.subheadline)
                    .foregroundStyle(themeComment)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 24)

            VStack(spacing: 14) {
                Picker("Auth Mode", selection: $authMode) {
                    Text("Sign In").tag(LaunchAuthMode.signIn)
                    Text("Sign Up").tag(LaunchAuthMode.signUp)
                }
                .pickerStyle(.segmented)

                TextField("Email", text: $authEmail)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $authPassword)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task {
                        if authMode == .signIn {
                            await supabase.signIn(email: authEmail, password: authPassword)
                        } else {
                            await supabase.signUp(email: authEmail, password: authPassword)
                        }

                        if supabase.isSignedIn {
                            await viewModel.loadSupabaseState()
                        }
                    }
                } label: {
                    Label(authMode == .signIn ? "Sign In" : "Create Account", systemImage: authMode == .signIn ? "person.crop.circle.badge.checkmark" : "person.badge.plus")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 8))
                .tint(themeGreen)
                .foregroundStyle(.white)
                .disabled(supabase.isWorking)

                Button {
                    authDismissed = true
                } label: {
                    Text("Continue without signing in")
                        .font(.caption.bold())
                        .foregroundStyle(themeComment)
                }
                .buttonStyle(.plain)

                if let authMessage = supabase.authMessage {
                    Text(authMessage)
                        .font(.caption2)
                        .foregroundStyle(themeYellow)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(18)
            .background(themePanel)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(themeLine, lineWidth: 1)
            )
            .padding(.horizontal, 20)

            Text("Educational market analysis and paper trading only. Not financial advice.")
                .font(.caption2)
                .foregroundStyle(themeComment)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
                .padding(.top, 18)

            Spacer(minLength: 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(themeBackground)
        .preferredColorScheme(activeColorScheme)
        .onTapGesture { hideKeyboard() }
    }

    // MARK: - Home Tab
    private var homeTab: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    topPanel
                    chartPanel
                    calculatorPanel
                    
                    // The Two Distinct AI Score Tiles
                    normalScorePanel
                    proScorePanel
                    
                    riskPanel
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
                .foregroundStyle(themeText)
                .onTapGesture { hideKeyboard() }
            }
            .background(themeBackground)
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("AI CRYPTO ANALYZER")
                        .font(.headline.weight(.black))
                        .foregroundStyle(themeText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(themePanel.ignoresSafeArea(edges: .top))
            }
        }
    }

    // MARK: - History Tab
    private var historyTab: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    performancePanel
                    tradeHistoryList
                }
                .padding(.horizontal, 12) 
                .padding(.vertical, 16)
                .foregroundStyle(themeText)
            }
            .background(themeBackground)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("TRADE HISTORY")
                        .font(.headline.weight(.black))
                        .foregroundStyle(themeText)
                    Spacer()
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.body.weight(.bold))
                            .foregroundStyle(themePink)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(themePanel.ignoresSafeArea(edges: .top))
            }
            .confirmationDialog(
                "Reset Demo Account?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete All History & Reset Balance", role: .destructive) {
                    viewModel.resetPaperTrading()
                    lastClosedTrade = nil
                    message = "Demo account reset."
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("This will permanently delete all trades and reset your balance to ₱100,000.")
            }
        }
    }

    // MARK: - Panels
    private var topPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("BTC/USDT").font(.headline.bold())
                    Text(viewModel.statusMessage).font(.caption2).foregroundStyle(themeComment)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(usdFormatter.string(from: NSNumber(value: signal.price)) ?? "$0.00").font(.headline.bold())
                    HStack(spacing: 4) {
                        Circle().fill(freshnessColor(viewModel.dataFreshness)).frame(width: 6, height: 6)
                        Text(viewModel.dataFreshness.label).font(.caption2)
                    }
                    .foregroundStyle(themeComment)
                }
            }
            
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(signal.decision.rawValue)
                        .font(.title2.bold())
                        .foregroundStyle(decisionColor(signal.decision))
                    Text("Risk: \(signal.risk.rawValue)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(riskColor(signal.risk))
                }
                Spacer()
                ScoreGauge(score: signal.buyScore.total)
            }

            HStack(spacing: 12) {
                MoneyField(title: "Demo Balance", value: demoBalance) {
                    activeHelpTopic = .demoBalance
                }
                MoneyField(title: "Invest Amount", value: $viewModel.investmentAmount) {
                    activeHelpTopic = .investAmount
                }
            }

            HStack(spacing: 12) {
                Button {
                    hideKeyboard()
                    message = viewModel.buyPaperTrade()
                    if message == nil {
                        lastClosedTrade = nil
                        message = "Demo buy recorded."
                    }
                } label: {
                    Label("BUY", systemImage: "arrow.up.circle.fill")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity, minHeight: 36)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 8))
                .tint(themeGreen)
                .foregroundStyle(.white)
                .disabled(store.openPosition != nil || signal.price <= 0)

                Button {
                    hideKeyboard()
                    switch viewModel.sellPaperTrade() {
                    case .success(let trade):
                        lastClosedTrade = trade
                        message = "Demo sell completed."
                    case .failure(let error):
                        message = error.localizedDescription
                    }
                } label: {
                    Label("SELL", systemImage: "arrow.down.circle.fill")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity, minHeight: 36)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 8))
                .tint(themePink)
                .foregroundStyle(.white)
                .disabled(signal.price <= 0)
                
                if store.openPosition != nil {
                    Button {
                        hideKeyboard()
                        switch viewModel.sellPartialPaperTrade(percent: 50) {
                        case .success(let trade):
                            if let trade {
                                lastClosedTrade = trade
                                message = "Sold 50% of position."
                            } else {
                                message = "Position too small to split."
                            }
                        case .failure(let error):
                            message = error.localizedDescription
                        }
                    } label: {
                        Label("SELL 50%", systemImage: "arrow.down.right.circle.fill")
                            .font(.caption2.bold())
                            .frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.roundedRectangle(radius: 8))
                    .tint(themeOrange)
                    .foregroundStyle(.white)
                }
            }
            
            if let message {
                Text(message).font(.caption2).foregroundStyle(themeYellow)
            }

            VStack(alignment: .leading, spacing: 6) {
                ForEach(signal.reasons, id: \.self) { reason in
                    Label(reason, systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(themeText)
                }
                ForEach(signal.warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(themeOrange)
                }
            }
            .padding(.top, 4)

            Divider().background(themeLine)

            let isHolding = store.openPosition != nil
            HStack(alignment: .top, spacing: 16) {
                VStack(spacing: 8) {
                    MetricRow(title: isHolding ? "Actual Entry" : "AI Entry", value: usdValue(signal.entryPrice), infoAction: { activeHelpTopic = .entry })
                    MetricRow(title: "Target 1", value: usdValue(signal.target1), color: themeGreen, infoAction: { activeHelpTopic = .target1 })
                    MetricRow(title: "Target 2", value: usdValue(signal.target2), color: themeGreen, infoAction: { activeHelpTopic = .target2 })
                }
                VStack(spacing: 8) {
                    MetricRow(title: "Breakeven", value: usdValue(signal.breakevenPrice), infoAction: { activeHelpTopic = .breakeven })
                    MetricRow(title: "Stop Loss", value: usdValue(signal.stopLoss), color: themePink, infoAction: { activeHelpTopic = .stopLoss })
                    
                    if isHolding, store.openPosition != nil {
                        let profit = store.unrealizedProfit(currentPrice: signal.price)
                        MetricRow(title: "Open P/L", value: phpValue(profit), color: profit >= 0 ? themeGreen : themePink, infoAction: { activeHelpTopic = .openProfit })
                    } else {
                        MetricRow(title: "Reward/Risk", value: "\(AppFormatters.number(signal.rewardRisk)):1", infoAction: { activeHelpTopic = .rewardRisk })
                    }
                    MetricRow(
                        title: isHolding ? "Position Size" : "Suggested Size",
                        value: btcQuantityValue(isHolding ? store.openPosition?.quantity : signal.suggestedPositionSize),
                        infoAction: { activeHelpTopic = .positionSize }
                    )
                }
            }

            if let lastUpdated = viewModel.lastUpdated {
                Text("Last signal update: \(lastUpdated.formatted(date: .omitted, time: .standard))")
                    .font(.caption2)
                    .foregroundStyle(themeComment)
            }
        }
        .panelStyle()
    }

    private var chartPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("BTC Chart").sectionLabel()

            TimeframeSelector(selected: viewModel.selectedChartTimeframe) { timeframe in
                viewModel.loadChartTimeframe(timeframe)
            }

            if chartCandles.isEmpty && viewModel.isLoading {
                VStack(spacing: 10) {
                    ProgressView()
                    Text("Loading BTC candles...").font(.caption).foregroundStyle(themeComment)
                }
                .frame(maxWidth: .infinity, minHeight: 200)
            } else if chartCandles.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "wifi.exclamationmark").font(.title2).foregroundStyle(themeOrange)
                    Text("Awaiting live stream...").font(.caption).foregroundStyle(themeComment)
                }
                .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                BinanceCandlestickChart(candles: chartCandles).frame(height: 480)
            }

            let snapshot = signal.fiveMinute
            HStack(alignment: .top, spacing: 16) {
                VStack(spacing: 6) {
                    MetricRow(title: "EMA 9", value: usdValue(snapshot.ema9), infoAction: { activeHelpTopic = .ema9 })
                    MetricRow(title: "EMA 21", value: usdValue(snapshot.ema21), infoAction: { activeHelpTopic = .ema21 })
                    MetricRow(title: "EMA 50", value: usdValue(snapshot.ema50), infoAction: { activeHelpTopic = .ema50 })
                }
                VStack(spacing: 6) {
                    MetricRow(title: "RSI 14", value: snapshot.rsi14.map { AppFormatters.number($0) } ?? "--", infoAction: { activeHelpTopic = .rsi })
                    MetricRow(title: "MACD", value: snapshot.isMACDBullish ? "Bullish" : "Bearish", infoAction: { activeHelpTopic = .macd })
                    MetricRow(title: "Volume", value: snapshot.volumeAboveAverage ? "High" : "Low", infoAction: { activeHelpTopic = .volume })
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(themePanel)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var calculatorPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Trade Settings").sectionLabel()
            PercentField(title: "Simulated Fees + Spread", value: $viewModel.feeAndSpreadPercent) {
                activeHelpTopic = .feesSpread
            }
        }
        .panelStyle()
    }

    private var normalScorePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("NORMAL SIGNAL DETAILS").sectionLabel()
            ScoreRow(title: "15m Trend", score: signal.normalBuyScore.trend, max: 30) { activeHelpTopic = .normalTrend }
            ScoreRow(title: "Momentum", score: signal.normalBuyScore.momentum, max: 25) { activeHelpTopic = .normalMomentum }
            ScoreRow(title: "Volume", score: signal.normalBuyScore.volume, max: 15) { activeHelpTopic = .normalVolume }
            ScoreRow(title: "5m Entry", score: signal.normalBuyScore.entry, max: 15) { activeHelpTopic = .normalEntry }
            ScoreRow(title: "Risk/Reward", score: signal.normalBuyScore.riskReward, max: 15) { activeHelpTopic = .normalRiskReward }
        }
        .panelStyle()
    }
    
    private var proScorePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PRO SIGNAL DETAILS").sectionLabel()
            ScoreRow(title: "Market Structure", score: signal.buyScore.marketStructure, max: 20) { activeHelpTopic = .marketStructure }
            ScoreRow(title: "Liquidity", score: signal.buyScore.liquidity, max: 20) { activeHelpTopic = .liquidity }
            ScoreRow(title: "Volatility", score: signal.buyScore.volatility, max: 15) { activeHelpTopic = .volatility }
            ScoreRow(title: "Session Activity", score: signal.buyScore.session, max: 10) { activeHelpTopic = .session }
            ScoreRow(title: "Entry Confirm", score: signal.buyScore.entryConfirmation, max: 15) { activeHelpTopic = .entryConfirmation }
            ScoreRow(title: "Risk Management", score: signal.buyScore.riskManagement, max: 20) { activeHelpTopic = .riskManagement }
            
            Divider().background(themeLine).padding(.vertical, 4)
            
            if let prob = signal.backtest.probability {
                MetricRow(title: "Backtest Win Rate", value: AppFormatters.percent(prob), infoAction: { activeHelpTopic = .backtest })
            }
            if let ev = signal.backtest.expectedValueR {
                MetricRow(title: "Expected Value", value: "\(AppFormatters.number(ev))R", infoAction: { activeHelpTopic = .expectedValue })
            }
            MetricRow(
                title: "Risk Budget",
                value: "\(phpValue(signal.accountRiskAmount)) @ \(AppFormatters.percent(signal.positionRiskPercent))",
                infoAction: { activeHelpTopic = .positionSize }
            )
            MetricRow(title: "Sell Score", value: "\(signal.sellScore) / 100", infoAction: { activeHelpTopic = .sellScore })
            
            if signal.sellScore > 0 {
                VStack(alignment: .leading, spacing: 4) {
                    ScoreRow(title: "Structure Weakness", score: signal.sellScoreBreakdown.structureWeakness, max: 25) { activeHelpTopic = .structureWeakness }
                    ScoreRow(title: "Liquidity Rejection", score: signal.sellScoreBreakdown.liquidityRejection, max: 20) { activeHelpTopic = .liquidityRejection }
                    ScoreRow(title: "Momentum Weakness", score: signal.sellScoreBreakdown.momentumWeakness, max: 20) { activeHelpTopic = .momentumWeakness }
                    ScoreRow(title: "Volatility Risk", score: signal.sellScoreBreakdown.volatilityRisk, max: 15) { activeHelpTopic = .volatilityRisk }
                    ScoreRow(title: "Exit Risk", score: signal.sellScoreBreakdown.exitRisk, max: 20) { activeHelpTopic = .exitRisk }
                }
            }
            
            if let trailing = signal.trailingStop.activeTrailingStop {
                MetricRow(title: "Trailing Stop", value: usdValue(trailing), color: themeOrange, infoAction: { activeHelpTopic = .trailingStop })
            }
            if signal.trailingStop.target1Hit {
                Text("✓ Target 1 hit — stop moved to breakeven")
                    .font(.caption2)
                    .foregroundStyle(themeGreen)
            }
            
            MetricRow(title: "Market Regime", value: signal.marketRegime.rawValue, color: regimeColor(signal.marketRegime), infoAction: { activeHelpTopic = .marketRegime })
            
            if let confluence = signal.confluenceWarning {
                Label(confluence, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption2)
                    .foregroundStyle(themeOrange)
                    .onTapGesture { activeHelpTopic = .confluenceWarning }
            }
        }
        .panelStyle()
    }

    private var riskPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Risk Notice").sectionLabel()
            Text("Signals are educational analysis based on BTC/USDT candles. Crypto trading is risky, and no signal guarantees profit.")
                .font(.caption2)
                .foregroundStyle(themeComment)
            Text("Backtest results are estimates, not guarantees. Past performance does not guarantee future results.")
                .font(.caption2)
                .foregroundStyle(themeComment)
        }
        .panelStyle()
    }
    
    // MARK: - History Panels

    private var performancePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("OVERALL PERFORMANCE").sectionLabel()
            
            HStack(spacing: 16) {
                MetricRow(title: "Total P/L", value: phpValue(store.totalProfit), color: store.totalProfit >= 0 ? themeGreen : themePink)
                MetricRow(title: "Win Rate", value: AppFormatters.percent(store.winRate))
            }
            
            MetricRow(title: "Current Balance", value: phpValue(store.demoBalance))
        }
        .panelStyle()
    }

    private var tradeHistoryList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("COMPLETED TRADES")
                .sectionLabel()
                .padding(.bottom, 12)
                .padding(.horizontal, 14)
                .padding(.top, 14)

            if store.history.isEmpty {
                Text("No demo trades yet.")
                    .font(.subheadline)
                    .foregroundStyle(themeComment)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                ForEach(Array(store.history.reversed().enumerated()), id: \.element.id) { index, trade in
                    SwipeToDeleteRow(
                        onDelete: {
                            let originalIndex = store.history.count - 1 - index
                            viewModel.deleteClosedTrade(at: IndexSet(integer: originalIndex))
                        }
                    ) {
                        tradeRowContent(for: trade)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(themePanel) 
                    }
                    
                    if index != store.history.count - 1 {
                        Divider().background(themeLine)
                    }
                }
            }
        }
        .background(themePanel) 
        .clipShape(RoundedRectangle(cornerRadius: 10)) 
    }
    
    private func tradeRowContent(for trade: ClosedPaperTrade) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text(trade.exitDate.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption.bold())
                    .foregroundStyle(themeText)
                Spacer()
                Text(phpValue(trade.profit))
                    .font(.subheadline.bold())
                    .foregroundStyle(trade.profit >= 0 ? themeGreen : themePink)
            }
            HStack {
                Text("Entry: \(usdValue(trade.entryPrice))")
                Spacer()
                Text("Exit: \(usdValue(trade.exitPrice))")
            }
            .font(.caption2)
            .foregroundStyle(themeComment)
        }
        .contentShape(Rectangle()) 
    }
}

// MARK: - Custom Swipe-to-Delete Component
private struct SwipeToDeleteRow<Content: View>: View {
    let onDelete: () -> Void
    let content: Content
    @State private var offset: CGFloat = 0

    init(onDelete: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.onDelete = onDelete
        self.content = content()
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            Button {
                withAnimation { offset = 0 }
                onDelete()
            } label: {
                ZStack {
                    themePink
                    Image(systemName: "trash")
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                        .padding(.trailing, 24)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .frame(width: UIScreen.main.bounds.width)
            
            content
                .background(themePanel) 
                .offset(x: offset)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            if value.translation.width < 0 {
                                offset = max(value.translation.width, -80)
                            } else if offset < 0 {
                                offset = min(0, -80 + value.translation.width)
                            }
                        }
                        .onEnded { value in
                            withAnimation {
                                if offset < -40 {
                                    offset = -80 
                                } else {
                                    offset = 0 
                                }
                            }
                        }
                )
        }
        .clipped() 
    }
}

// MARK: - Settings Tab

struct SettingsTab: View {
    @ObservedObject var viewModel: MarketViewModel
    @StateObject private var supabase = SupabaseService.shared
    @AppStorage("autoTradeEnabled") private var autoTradeEnabled = false
    @AppStorage("appTheme") private var appTheme = 1
    @AppStorage("buySoundID") private var buySoundID = 1054
    @AppStorage("sellSoundID") private var sellSoundID = 1006
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    accountPanel
                    
                    VStack(alignment: .leading, spacing: 10) {
                        Text("AUTOMATION").sectionLabel()
                        Toggle("Auto Buy/Sell", isOn: $autoTradeEnabled)
                            .tint(themeGreen)
                            .font(.subheadline.bold())
                        Text("When enabled, the app will automatically execute simulated Paper Trades as soon as the AI signals a Buy or Sell.")
                            .font(.caption2)
                            .foregroundStyle(themeComment)
                    }
                    .panelStyle()
                    
                    VStack(alignment: .leading, spacing: 10) {
                        Text("APPEARANCE").sectionLabel()
                        Picker("Theme", selection: $appTheme) {
                            Text("System").tag(0)
                            Text("Night Mode").tag(1)
                            Text("Light Mode").tag(2)
                        }
                        .pickerStyle(.segmented)
                        .padding(.vertical, 4)
                    }
                    .panelStyle()
                    
                    VStack(alignment: .leading, spacing: 10) {
                        Text("IN-APP ALERT SOUNDS").sectionLabel()
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("BUY SIGNAL")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(themeComment)
                            
                            HStack {
                                Picker("", selection: $buySoundID) {
                                    Text("Muted").tag(0)
                                    Text("Telegraph (Default)").tag(1054)
                                    Text("Cash Register").tag(1000)
                                    Text("Positive Pop").tag(1325)
                                    Text("Classic Bell").tag(1315)
                                    Text("Success Beep").tag(1025)
                                    Text("Soft Ding").tag(1023)
                                    Text("Glass Chime").tag(1115)
                                    Text("Double Chime").tag(1113)
                                    Text("Fanfare").tag(1036)
                                    Text("Synth Ascent").tag(1333)
                                }
                                .pickerStyle(.menu)
                                .labelsHidden()
                                
                                Spacer()
                                
                                Button {
                                    testAlert(isBuy: true, soundID: buySoundID)
                                } label: {
                                    Image(systemName: "play.circle.fill")
                                        .font(.title2)
                                }
                                .buttonStyle(.borderless)
                                .tint(themeGreen)
                            }
                        }
                        .padding(.vertical, 4)
                        
                        Divider().background(themeLine)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SELL SIGNAL")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(themeComment)
                            
                            HStack {
                                Picker("", selection: $sellSoundID) {
                                    Text("Muted").tag(0)
                                    Text("Low Power (Default)").tag(1006)
                                    Text("Alert Beep").tag(1320)
                                    Text("Alarm Horn").tag(1005)
                                    Text("Warning Buzz").tag(1030)
                                    Text("System Error").tag(1326)
                                    Text("Harsh Buzz").tag(1327)
                                    Text("Dump (Trash)").tag(1013)
                                    Text("Swoosh Exit").tag(1031)
                                    Text("News Flash").tag(1051)
                                    Text("Synth Descent").tag(1334)
                                }
                                .pickerStyle(.menu)
                                .labelsHidden()
                                
                                Spacer()
                                
                                Button {
                                    testAlert(isBuy: false, soundID: sellSoundID)
                                } label: {
                                    Image(systemName: "play.circle.fill")
                                        .font(.title2)
                                }
                                .buttonStyle(.borderless)
                                .tint(themePink)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .panelStyle()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
            }
            .background(themeBackground)
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("SETTINGS")
                        .font(.headline.weight(.black))
                        .foregroundStyle(themeText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(themePanel.ignoresSafeArea(edges: .top))
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .onTapGesture { hideKeyboard() }
    }

    private var accountPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ACCOUNT SYNC").sectionLabel()

            if supabase.isSignedIn {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(supabase.userEmail)
                            .font(.subheadline.bold())
                            .foregroundStyle(themeText)
                        Text("Web and iPhone paper trades use the same Supabase account.")
                            .font(.caption2)
                            .foregroundStyle(themeComment)
                    }
                    Spacer()
                    Button("Sign Out") {
                        supabase.signOut()
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.roundedRectangle(radius: 8))
                    .tint(themePink)
                }

                Button {
                    Task { await viewModel.loadSupabaseState() }
                } label: {
                    Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 8))
                .tint(themeGreen)
                .foregroundStyle(.white)
            } else {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)

                HStack(spacing: 10) {
                    Button {
                        Task {
                            await supabase.signIn(email: email, password: password)
                            await viewModel.loadSupabaseState()
                        }
                    } label: {
                        Label("Sign In", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.roundedRectangle(radius: 8))
                    .tint(themeGreen)
                    .foregroundStyle(.white)
                    .disabled(supabase.isWorking)

                    Button {
                        Task {
                            await supabase.signUp(email: email, password: password)
                            await viewModel.loadSupabaseState()
                        }
                    } label: {
                        Label("Sign Up", systemImage: "person.badge.plus")
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.roundedRectangle(radius: 8))
                    .tint(themeGreen)
                    .disabled(supabase.isWorking)
                }
            }

            if let authMessage = supabase.authMessage {
                Text(authMessage)
                    .font(.caption2)
                    .foregroundStyle(themeYellow)
            }
        }
        .panelStyle()
    }
    
    private func testAlert(isBuy: Bool, soundID: Int) {
        if soundID > 0 {
            Task {
                for _ in 0..<4 {
                    AudioServicesPlaySystemSound(SystemSoundID(soundID))
                    try? await Task.sleep(nanoseconds: 800_000_000)
                }
            }
        }
        
        let content = UNMutableNotificationContent()
        content.title = isBuy ? "🚀 Test: Time to Buy BTC!" : "⚠️ Test: Time to Sell BTC!"
        content.body = "If you see this, your push notifications are working perfectly!"
        content.sound = .default
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - Tutorial Tab

private struct TutorialSection: Identifiable {
    let title: String
    let explanation: String
    let example: String

    var id: String { title }

    init(_ title: String, _ explanation: String, example: String) {
        self.title = title
        self.explanation = explanation
        self.example = example
    }
}

struct TutorialTab: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    NavigationLink {
                        TutorialDetailView(
                            title: "Home Field Guide",
                            sections: [
                                TutorialSection("Decision", "This is the app's plain answer: buy, consider buy, wait, no trade, hold, or sell. Treat it like a dashboard warning light, not a guaranteed prediction.", example: "If it says Consider Buy, the setup is improving but not perfect. If it says No Trade, the app thinks the risk is not worth it right now."),
                                TutorialSection("AI Entry", "This is the price the app uses as the planned entry before you buy. Once you buy, it changes to your actual entry price.", example: "If BTC is $80,000 and you have not bought yet, AI Entry may show $80,000. After buying, Actual Entry stays tied to your buy price."),
                                TutorialSection("Breakeven", "This is the price where your trade stops losing after fees and spread. You need price above breakeven before you are really in profit.", example: "If entry is $80,000 and costs are 0.5%, breakeven is about $80,400."),
                                TutorialSection("Target 1 and Target 2", "Targets are profit areas. Target 1 is closer and safer. Target 2 is farther and more ambitious.", example: "A trader may sell part at Target 1, then leave the rest for Target 2 if momentum stays strong."),
                                TutorialSection("Stop Loss", "Stop Loss is the emergency exit if the trade idea fails. It protects your balance from one bad trade becoming too large.", example: "If entry is $80,000 and stop is $78,800, the app is saying the setup is invalid if BTC falls that far."),
                                TutorialSection("Reward/Risk", "This compares possible profit against possible loss. The app likes setups where reward is at least 2 times the risk.", example: "Risk ₱1,000 to potentially make ₱2,000 is 2:1. Risk ₱1,000 to make only ₱700 is weak."),
                                TutorialSection("Normal Signal Details", "This is your original simple formula: Trend + Momentum + Volume + Entry + Risk/Reward. It is easier to understand and good for learning.", example: "A 75/100 Normal score means most of the basic buy conditions are present."),
                                TutorialSection("Pro Signal Details", "This is the stricter version. It adds market structure, liquidity, volatility, session activity, risk checks, order book info, and backtest probability.", example: "Pro may reject a trade even when Normal looks okay if the order book or expected value looks weak.")
                            ]
                        )
                    } label: {
                        TutorialCard(icon: "info.circle.fill", title: "Home Field Guide", subtitle: "Every main Home field explained simply.")
                    }
                    
                    NavigationLink {
                        TutorialDetailView(
                            title: "How to Use the App",
                            sections: [
                                TutorialSection("Before You Buy", "Look first at the decision, then check the Normal and Pro details. You want the app to say Strong Buy or Consider Buy, with risk not marked High.", example: "If decision is Wait and Pro score is weak, do nothing. Waiting is a trade decision too."),
                                TutorialSection("After You Buy", "The app changes focus from buying to managing the position. Your actual entry becomes the base for breakeven, stop loss, targets, and open profit/loss.", example: "If you buy at $80,000, the app keeps using $80,000 as the entry even if BTC moves to $80,500."),
                                TutorialSection("When to Sell", "Sell signals come from Sell Score, stop loss danger, target hits, and bearish momentum. You do not need to guess from emotion.", example: "If BTC reaches Target 1 and Sell Score rises, you may take profit instead of hoping forever."),
                                TutorialSection("Paper Trading", "Paper trading is practice trading. It lets you test the strategy with fake money while live BTC data keeps moving.", example: "Try 20 demo trades first. If the rules are not profitable in practice, do not use real money yet."),
                                TutorialSection("Risk Reminder", "A signal is only a probability tool. It can be wrong. Good trading means losing small when wrong and winning larger when right.", example: "Even a 70% setup can lose 3 times out of 10. That is why stop loss matters.")
                            ]
                        )
                    } label: {
                        TutorialCard(icon: "iphone", title: "How to Use the App", subtitle: "Targets, Stop Loss, and Risk explained.")
                    }

                    NavigationLink {
                        TutorialDetailView(
                            title: "The AI Formula",
                            sections: [
                                TutorialSection("Normal Formula", "Normal is the simple 100-point formula you gave: Trend 30, Momentum 25, Volume 15, Entry 15, Risk/Reward 15.", example: "Trend 30 + Momentum 20 + Volume 15 + Entry 10 + Risk/Reward 15 = 90, which is Strong Buy territory."),
                                TutorialSection("Trend", "Trend asks if the bigger direction is friendly for buying. It checks price above EMA50 and EMA9 above EMA21.", example: "BTC above EMA50 means the bigger trend is healthier. EMA9 above EMA21 means shorter momentum is also up."),
                                TutorialSection("Momentum", "Momentum asks if buyers are gaining strength. RSI, RSI direction, and MACD are used here.", example: "RSI 54, RSI rising, and MACD bullish means momentum is clean."),
                                TutorialSection("Volume", "Volume asks if enough traders are participating. Moves with low volume can fail easily.", example: "If current volume is 1,500 BTC and average is 1,100 BTC, volume passes."),
                                TutorialSection("Entry", "Entry asks if the timing is good right now, not just whether BTC is generally bullish.", example: "Near EMA21, green candle, and breaking previous high means buyers may be stepping in now."),
                                TutorialSection("Risk/Reward", "Risk/Reward asks if the trade is worth taking. The app wants at least 2:1.", example: "Entry $100,000, stop $99,000, target $102,500 gives 2.5:1.")
                            ]
                        )
                    } label: {
                        TutorialCard(icon: "function", title: "The AI Formula", subtitle: "How it decides when to Buy or Sell.")
                    }

                    NavigationLink {
                        TutorialDetailView(
                            title: "Pro Signal Details & Metrics",
                            sections: [
                                TutorialSection("Market Structure", "Noob version: is the chart making stairs upward or stairs downward? Upward stairs are better for buys.", example: "Higher high at $80,800 and higher low at $79,500 is bullish structure."),
                                TutorialSection("Liquidity", "Noob version: did price fake out traders first, then reverse? The app likes fake drops that recover fast.", example: "BTC dips below $79,000, triggers stops, then closes back above $79,000. That can be bullish."),
                                TutorialSection("Volatility", "Noob version: is BTC moving enough to make money, but not so wild that it is chaos?", example: "A steady $300-$600 movement may be tradable. A tiny flat line is not useful. A giant spike can be risky."),
                                TutorialSection("Session Activity", "Noob version: are enough people trading right now, and is the spread small?", example: "A tight bid/ask spread means buying and selling costs less."),
                                TutorialSection("Entry Confirmation", "Noob version: do we have final proof that buyers are showing up now?", example: "RSI rising, MACD bullish, and a close above EMA21 gives stronger confirmation."),
                                TutorialSection("Risk Management", "Noob version: even if the chart looks good, is the possible loss controlled?", example: "If one trade can damage the demo account too much, the app blocks or weakens the signal."),
                                TutorialSection("Backtest Probability", "Noob version: when the app saw similar setups recently, how often did they work?", example: "If 8 of 12 similar setups hit target before stop, probability is about 67%."),
                                TutorialSection("Expected Value", "Noob version: if you repeated this kind of trade many times, would the math likely be positive?", example: "A setup can have only 45% win rate and still be good if winners are much bigger than losers."),
                                TutorialSection("Order Book", "Noob version: bookTicker checks spread, depth checks buyer/seller pressure near current price.", example: "If bid depth is stronger than ask depth, there may be more nearby buy support."),
                                TutorialSection("Sell Score", "Noob version: this is the exit pressure meter. The higher it gets, the more the app sees reasons to sell.", example: "Bearish MACD, price under EMA21, and rejected resistance can push Sell Score higher.")
                            ]
                        )
                    } label: {
                        TutorialCard(icon: "bolt.shield.fill", title: "Pro Signal Details", subtitle: "Market Structure, Liquidity, EV, and Depth explained.")
                    }

                    NavigationLink {
                        TutorialDetailView(
                            title: "Reading Charts & Indicators",
                            sections: [
                                TutorialSection("Candles", "A candle is one block of time. It shows where price opened, how high it went, how low it went, and where it closed.", example: "On 5m, one candle equals 5 minutes. Green means close is above open. Red means close is below open."),
                                TutorialSection("Wicks", "Wicks are the thin lines above or below a candle. They show price tried to go somewhere but got rejected.", example: "A long lower wick means price dropped, but buyers pushed it back up."),
                                TutorialSection("Volume", "Volume shows how much BTC traded during the candle. It helps confirm whether a move has real participation.", example: "A breakout with high volume is stronger than a breakout with low volume."),
                                TutorialSection("EMA 9", "EMA 9 is the fast line. It reacts quickly and helps show short-term push.", example: "Price above EMA9 can mean short-term buyers are active."),
                                TutorialSection("EMA 21", "EMA 21 is the pullback line. In an uptrend, price often dips near it before continuing.", example: "BTC touches EMA21 and bounces with a green candle. That can be a cleaner entry."),
                                TutorialSection("EMA 50", "EMA 50 is the bigger trend filter. It helps avoid buying while the market is generally weak.", example: "If BTC is below EMA50, the app becomes more careful about buy signals."),
                                TutorialSection("RSI 14", "RSI measures speed and strength. The app likes RSI that is healthy, not exhausted.", example: "RSI 55 and rising is often better than RSI 80, because 80 can mean price is already too stretched."),
                                TutorialSection("MACD", "MACD compares momentum lines. Bullish means momentum is turning upward. Bearish means momentum is weakening.", example: "MACD bullish plus rising RSI gives the app more confidence.")
                            ]
                        )
                    } label: {
                        TutorialCard(icon: "chart.bar.xaxis", title: "Reading Charts & Indicators", subtitle: "Candles, RSI, MACD, and EMAs explained.")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
            }
            .background(themeBackground)
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("TUTORIALS")
                        .font(.headline.weight(.black))
                        .foregroundStyle(themeText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(themePanel.ignoresSafeArea(edges: .top))
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

private struct TutorialCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title)
                .foregroundStyle(themeGreen)
                .frame(width: 32)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline.bold())
                    .foregroundStyle(themeText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(themeComment)
                    .multilineTextAlignment(.leading)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(themeLine)
        }
        .padding(16)
        .background(themePanel)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct TutorialDetailView: View {
    let title: String
    let sections: [TutorialSection]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(section.title)
                            .font(.headline.bold())
                            .foregroundStyle(themeGreen)
                        Text(section.explanation)
                            .font(.subheadline)
                            .foregroundStyle(themeText)
                            .lineSpacing(4)
                        Divider().background(themeLine)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Example")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(themeComment)
                            Text(section.example)
                                .font(.caption)
                                .foregroundStyle(themeText)
                                .lineSpacing(3)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(themePanel)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 16)
        }
        .background(themeBackground)
        .navigationBarBackButtonHidden(true)
        .safeAreaInset(edge: .top) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.bold))
                        .foregroundStyle(themeGreen)
                }
                Spacer()
                Text(title)
                    .font(.headline.weight(.black))
                    .foregroundStyle(themeText)
                Spacer()
                Image(systemName: "chevron.left").opacity(0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(themePanel.ignoresSafeArea(edges: .top))
        }
    }
}

// MARK: - Dev Terminal Tab

struct DevTerminalTab: View {
    let wsLogs: [String]
    let restLogs: [String]
    let reconnect: () -> Void
    
    @State private var selectedLogTab = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $selectedLogTab) {
                    Text("Live Sockets").tag(0)
                    Text("REST API").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()
                .background(themePanel)

                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        let activeLogs = selectedLogTab == 0 ? wsLogs : restLogs
                        
                        if activeLogs.isEmpty {
                            Text(selectedLogTab == 0 ? "Awaiting socket payload..." : "Awaiting REST payload...")
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(themeComment)
                        } else {
                            ForEach(Array(activeLogs.enumerated()), id: \.offset) { index, log in
                                if (selectedLogTab == 0 && !log.contains("REST")) || (selectedLogTab == 1 && log.contains("REST")) {
                                    Text(log)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(index == 0 ? themeGreen : themeComment)
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                }
                .background(Color.black)
                
                Button("Force Reconnect WebSockets") {
                    reconnect()
                }
                .buttonStyle(.borderedProminent)
                .tint(themePink)
                .padding()
            }
            .background(themeBackground)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("DEV TERMINAL")
                        .font(.headline.weight(.black))
                        .foregroundStyle(themeText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(themePanel.ignoresSafeArea(edges: .top))
            }
        }
    }
}

// MARK: - Subviews & Chart

private struct TimeframeSelector: View {
    let selected: Timeframe
    let onSelect: (Timeframe) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Timeframe.allCases) { timeframe in
                Button {
                    onSelect(timeframe)
                } label: {
                    Text(timeframe.title)
                        .font(.caption2.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(selected == timeframe ? themeGreen.opacity(0.15) : themeSurface)
                        .foregroundStyle(selected == timeframe ? themeGreen : themeComment)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(selected == timeframe ? themeGreen : themeLine, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private let chartBackground = themeBackground
private let chartGrid = themeLine
private let chartAxis = themeComment
private let chartGreen = themeGreen
private let chartRed = themePink
private let chartYellow = themeYellow
private let chartPink = themePink
private let chartPurple = themePurple

private func chartPrice(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(2)).grouping(.automatic))
}

private func shortDate(_ date: Date) -> String {
    date.formatted(.dateTime.month(.twoDigits).day(.twoDigits))
}

private struct BinanceCandlestickChart: View {
    let candles: [Candle]

    @State private var zoomScale: CGFloat = 1
    @State private var gestureBaseZoomScale: CGFloat = 1

    private let minimumZoom: CGFloat = 0.65
    private let maximumZoom: CGFloat = 4

    private var displayCandles: [Candle] {
        let maxVisible = Int(UIScreen.main.bounds.width / (9 * zoomScale)) + 20
        return Array(candles.suffix(min(maxVisible, candles.count)))
    }
    
    private var latest: Candle? { displayCandles.last }
    private var previous: Candle? {
        guard displayCandles.count > 1 else { return nil }
        return displayCandles[displayCandles.count - 2]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            chartHeader
            zoomControls

            GeometryReader { proxy in
                let candleSpacing = 9 * zoomScale
                let contentWidth = max(proxy.size.width, CGFloat(displayCandles.count) * candleSpacing + 70)

                ScrollViewReader { scrollProxy in
                    ScrollView(.horizontal, showsIndicators: true) {
                        HStack(spacing: 0) {
                            Color.clear.frame(width: 1, height: 1).id("first-candle")

                            CandlestickCanvas(candles: displayCandles)
                                .frame(width: contentWidth, height: 360)
                                .gesture(
                                    MagnificationGesture()
                                        .onChanged { value in zoomScale = clampedZoom(gestureBaseZoomScale * value) }
                                        .onEnded { value in
                                            zoomScale = clampedZoom(gestureBaseZoomScale * value)
                                            gestureBaseZoomScale = zoomScale
                                        }
                                )

                            Color.clear.frame(width: 1, height: 1).id("latest-candle")
                        }
                    }
                    .background(chartBackground)
                    .onAppear { scrollProxy.scrollTo("latest-candle", anchor: .trailing) }
                    .onChange(of: latest?.openTime) { _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            scrollProxy.scrollTo("latest-candle", anchor: .trailing)
                        }
                    }
                }
            }
            .frame(height: 360)
        }
        .background(chartBackground)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var chartHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let latest {
                HStack(spacing: 8) {
                    Text(latest.openTime.formatted(date: .numeric, time: .omitted))
                    chartLabel("O", latest.open)
                    chartLabel("H", latest.high)
                    chartLabel("L", latest.low)
                    chartLabel("C", latest.close)

                    if let previous, previous.close > 0 {
                        let change = (latest.close - previous.close) / previous.close * 100
                        Text(AppFormatters.percent(change))
                            .foregroundStyle(change >= 0 ? chartGreen : chartRed)
                    }
                }
                .font(.system(size: 10, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            }

            HStack(spacing: 10) {
                if let ma7 = movingAverage(period: 7) { legend("MA(7)", ma7, color: chartYellow) }
                if let ma25 = movingAverage(period: 25) { legend("MA(25)", ma25, color: chartPink) }
                if let ma99 = movingAverage(period: 99) { legend("MA(99)", ma99, color: chartPurple) }
            }
            .font(.system(size: 10, weight: .medium))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(chartBackground)
    }

    private var zoomControls: some View {
        HStack(spacing: 8) {
            Button { setZoom(zoomScale / 1.25) } label: { Image(systemName: "minus.magnifyingglass").frame(width: 28, height: 24) }
            .disabled(zoomScale <= minimumZoom)

            Button { setZoom(1) } label: { Image(systemName: "arrow.counterclockwise").frame(width: 28, height: 24) }

            Button { setZoom(zoomScale * 1.25) } label: { Image(systemName: "plus.magnifyingglass").frame(width: 28, height: 24) }
            .disabled(zoomScale >= maximumZoom)

            Text("\(Int(zoomScale * 100))%").font(.caption2.weight(.bold)).foregroundStyle(chartAxis)
            Spacer()
        }
        .buttonStyle(.plain)
        .foregroundStyle(chartAxis)
        .padding(.horizontal, 8)
        .padding(.bottom, 6)
        .background(chartBackground)
    }

    private func chartLabel(_ title: String, _ value: Double) -> some View {
        HStack(spacing: 2) {
            Text(title).foregroundStyle(themeComment)
            Text(usdFormatter.string(from: NSNumber(value: value)) ?? "$0.00").foregroundStyle(chartGreen)
        }
    }

    private func legend(_ title: String, _ value: Double, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(title).foregroundStyle(themeComment)
            Text(usdFormatter.string(from: NSNumber(value: value)) ?? "$0.00").foregroundStyle(color)
        }
    }

    private func movingAverage(period: Int) -> Double? {
        guard displayCandles.count >= period else { return nil }
        let closes = displayCandles.suffix(period).map(\.close)
        return closes.reduce(0, +) / Double(period)
    }

    private func setZoom(_ newValue: CGFloat) {
        zoomScale = clampedZoom(newValue)
        gestureBaseZoomScale = zoomScale
    }

    private func clampedZoom(_ value: CGFloat) -> CGFloat {
        min(max(value, minimumZoom), maximumZoom)
    }
}

private struct CandlestickCanvas: View {
    let candles: [Candle]

    var body: some View {
        Canvas { context, size in
            guard candles.count > 1 else { return }

            let topPadding: CGFloat = 8
            let leftPadding: CGFloat = 4
            let rightPadding: CGFloat = 58
            let priceHeight = size.height * 0.67
            let volumeTop = topPadding + priceHeight + 20
            let volumeHeight = max(50, size.height - volumeTop - 24)
            let bottomLabelY = volumeTop + volumeHeight + 12
            let plotWidth = max(1, size.width - leftPadding - rightPadding)
            let step = plotWidth / CGFloat(candles.count)
            let bodyWidth = max(3, min(9, step * 0.72))

            var background = Path()
            background.addRect(CGRect(origin: .zero, size: size))
            context.fill(background, with: .color(chartBackground))

            let high = candles.map(\.high).max() ?? 1
            let low = candles.map(\.low).min() ?? 0
            let padding = max((high - low) * 0.08, 1)
            let maxPrice = high + padding
            let minPrice = max(0, low - padding)
            let maxVolume = max(candles.map(\.volume).max() ?? 1, 1)

            func x(_ index: Int) -> CGFloat { leftPadding + CGFloat(index) * step + step / 2 }
            func y(_ price: Double) -> CGFloat { topPadding + CGFloat((maxPrice - price) / max(maxPrice - minPrice, 1)) * priceHeight }
            func volumeY(_ volume: Double) -> CGFloat { volumeTop + CGFloat(1 - volume / maxVolume) * volumeHeight }

            for index in 0...4 {
                let ratio = CGFloat(index) / 4
                let lineY = topPadding + ratio * priceHeight
                var path = Path()
                path.move(to: CGPoint(x: leftPadding, y: lineY))
                path.addLine(to: CGPoint(x: size.width - rightPadding, y: lineY))
                context.stroke(path, with: .color(chartGrid), lineWidth: 1)

                let price = maxPrice - Double(ratio) * (maxPrice - minPrice)
                context.draw(
                    Text(chartPrice(price)).font(.system(size: 9)).foregroundStyle(chartAxis),
                    at: CGPoint(x: size.width - rightPadding + 4, y: lineY),
                    anchor: .leading
                )
            }

            for index in 0...3 {
                let ratio = CGFloat(index) / 3
                let lineX = leftPadding + ratio * plotWidth
                var path = Path()
                path.move(to: CGPoint(x: lineX, y: topPadding))
                path.addLine(to: CGPoint(x: lineX, y: volumeTop + volumeHeight))
                context.stroke(path, with: .color(chartGrid), lineWidth: 1)

                let candleIndex = min(candles.count - 1, max(0, Int(round(ratio * CGFloat(candles.count - 1)))))
                context.draw(
                    Text(shortDate(candles[candleIndex].openTime)).font(.system(size: 9)).foregroundStyle(chartAxis),
                    at: CGPoint(x: lineX, y: bottomLabelY),
                    anchor: .center
                )
            }

            // MAs
            for (period, color) in [(7, chartYellow), (25, chartPink), (99, chartPurple)] {
                guard candles.count >= period else { continue }
                var path = Path()
                var didStart = false
                for index in (period - 1)..<candles.count {
                    let avg = candles[(index - period + 1)...index].map(\.close).reduce(0, +) / Double(period)
                    let point = CGPoint(x: x(index), y: y(avg))
                    if didStart { path.addLine(to: point) } else { path.move(to: point); didStart = true }
                }
                context.stroke(path, with: .color(color), lineWidth: 1.4)
            }

            for (index, candle) in candles.enumerated() {
                let candleX = x(index)
                let color = candle.close >= candle.open ? chartGreen : chartRed
                
                var wick = Path()
                wick.move(to: CGPoint(x: candleX, y: y(candle.high)))
                wick.addLine(to: CGPoint(x: candleX, y: y(candle.low)))
                context.stroke(wick, with: .color(color), lineWidth: 1.2)

                let openY = y(candle.open)
                let closeY = y(candle.close)
                var body = Path()
                body.addRect(CGRect(x: candleX - bodyWidth / 2, y: min(openY, closeY), width: bodyWidth, height: max(abs(openY - closeY), 2)))
                context.fill(body, with: .color(color))

                let barY = volumeY(candle.volume)
                var volBar = Path()
                volBar.addRect(CGRect(x: candleX - bodyWidth / 2, y: barY, width: bodyWidth, height: max(1, volumeTop + volumeHeight - barY)))
                context.fill(volBar, with: .color(color.opacity(0.8)))
            }

            if let latest = candles.last {
                let latestY = y(latest.close)
                var priceLine = Path()
                priceLine.move(to: CGPoint(x: leftPadding, y: latestY))
                priceLine.addLine(to: CGPoint(x: size.width - rightPadding, y: latestY))
                context.stroke(priceLine, with: .color(chartGreen.opacity(0.5)), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))

                let tagRect = CGRect(x: size.width - rightPadding + 2, y: latestY - 10, width: rightPadding - 2, height: 20)
                var tag = Path()
                tag.addRect(tagRect)
                context.fill(tag, with: .color(chartGreen))
                context.draw(
                    Text(chartPrice(latest.close)).font(.system(size: 9, weight: .bold)).foregroundStyle(.white),
                    at: CGPoint(x: tagRect.midX, y: tagRect.midY),
                    anchor: .center
                )
            }
        }
    }
}

// MARK: - Reusable UI Components

private struct ScoreGauge: View {
    let score: Int
    var body: some View {
        ZStack {
            Circle().stroke(themeLine, lineWidth: 6)
            Circle()
                .trim(from: 0, to: min(Double(score), 100) / 100)
                .stroke(themeGreen, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)").font(.headline.bold())
                Text("/100").font(.system(size: 9)).foregroundStyle(themeComment)
            }
        }
        .frame(width: 54, height: 54)
    }
}

private struct HelpInfoButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "info.circle")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(themeBlue)
                .frame(width: 14, height: 14)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Show explanation")
    }
}

private struct HomeHelpSheet: View {
    let topic: HelpTopic
    let moreAction: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("WHAT IS THIS?")
                            .sectionLabel()
                        Text(topic.explanation)
                            .font(.subheadline)
                            .foregroundStyle(themeText)
                            .lineSpacing(4)
                    }
                    .panelStyle()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("REAL-WORLD EXAMPLE")
                            .sectionLabel()
                        Text(topic.example)
                            .font(.subheadline)
                            .foregroundStyle(themeText)
                            .lineSpacing(4)
                    }
                    .panelStyle()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("HOW IT AFFECTS THE SCORE")
                            .sectionLabel()
                        Text(topic.calcEffect)
                            .font(.subheadline)
                            .foregroundStyle(themeText)
                            .lineSpacing(4)
                    }
                    .panelStyle()
                }
                .padding(16)
            }
            .background(themeBackground)
            .navigationTitle(topic.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(themeGreen)
                }
            }
        }
    }
}

private struct ScoreRow: View {
    let title: String
    let score: Int
    let max: Int
    var infoAction: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 4) {
            MetricRow(title: title, value: "\(score) / \(max)", infoAction: infoAction)
            ProgressView(value: Double(score), total: Double(max)).tint(themeGreen)
        }
    }
}

private struct MetricRow: View {
    let title: String
    let value: String
    var color: Color = themeText
    var infoAction: (() -> Void)? = nil

    var body: some View {
        HStack {
            if let infoAction {
                HelpInfoButton(action: infoAction)
            }
            Text(title).foregroundStyle(themeComment)
            Spacer(minLength: 4)
            Text(value)
                .fontWeight(.semibold)
                .foregroundStyle(color)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .font(.caption)
    }
}

private struct MoneyField: View {
    let title: String
    @Binding var value: Double
    var infoAction: (() -> Void)? = nil
    @State private var textValue: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if let infoAction {
                    HelpInfoButton(action: infoAction)
                }
                Text(title).font(.caption2).foregroundStyle(themeComment)
            }
            HStack(spacing: 2) {
                Text("₱").font(.caption.bold()).foregroundStyle(themeComment)
                TextField(title, text: $textValue)
                    .keyboardType(.decimalPad)
                    .font(.caption)
                    .foregroundStyle(themeText)
                    .tint(themeGreen)
                    .onChange(of: textValue) { newValue in
                        if let d = Double(newValue.replacingOccurrences(of: ",", with: "")) { value = d }
                    }
                    .onChange(of: value) { newValue in
                        let stringValue = newValue.truncatingRemainder(dividingBy: 1) == 0 ? formatToTwoDecimals(newValue) : formatToTwoDecimals(newValue)
                        if Double(textValue.replacingOccurrences(of: ",", with: "")) != newValue { textValue = stringValue }
                    }
                    .onAppear { textValue = formatToTwoDecimals(value) }
            }
            .padding(8)
            .background(themeSurface)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay { RoundedRectangle(cornerRadius: 6).stroke(themeLine, lineWidth: 1) }
        }
    }
}

private struct PercentField: View {
    let title: String
    @Binding var value: Double
    var infoAction: (() -> Void)? = nil
    @State private var textValue: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if let infoAction {
                    HelpInfoButton(action: infoAction)
                }
                Text(title).font(.caption2).foregroundStyle(themeComment)
            }
            HStack {
                TextField(title, text: $textValue)
                    .keyboardType(.decimalPad)
                    .font(.caption)
                    .foregroundStyle(themeText)
                    .tint(themeGreen)
                    .onChange(of: textValue) { newValue in
                        if let d = Double(newValue.replacingOccurrences(of: ",", with: "")) { value = d }
                    }
                    .onChange(of: value) { newValue in
                        let stringValue = newValue.truncatingRemainder(dividingBy: 1) == 0 ? formatToTwoDecimals(newValue) : formatToTwoDecimals(newValue)
                        if Double(textValue.replacingOccurrences(of: ",", with: "")) != newValue { textValue = stringValue }
                    }
                    .onAppear { textValue = formatToTwoDecimals(value) }
                Text("%").font(.caption).foregroundStyle(themeComment)
            }
            .padding(8)
            .background(themeSurface)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay { RoundedRectangle(cornerRadius: 6).stroke(themeLine, lineWidth: 1) }
        }
    }
}

private extension View {
    func panelStyle() -> some View {
        self
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(themePanel)
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    func sectionLabel() -> some View {
        self
            .font(.caption.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(themeComment)
    }
}

private func decisionColor(_ decision: SignalDecision) -> Color {
    switch decision {
    case .strongBuy, .considerBuy: return themeGreen
    case .wait, .hold: return themeYellow
    case .noTrade: return themeComment
    case .considerSell, .sellExit: return themePink
    }
}

private func riskColor(_ risk: RiskLevel) -> Color {
    switch risk {
    case .low: return themeGreen
    case .medium: return themeOrange
    case .high: return themePink
    }
}

private func regimeColor(_ regime: MarketRegime) -> Color {
    switch regime {
    case .trending: return themeGreen
    case .ranging: return themeYellow
    case .volatile_chop: return themePink
    case .quiet: return themeComment
    }
}

private func freshnessColor(_ freshness: DataFreshness) -> Color {
    switch freshness {
    case .connecting: return themeOrange
    case .live: return themeGreen
    case .delayed: return themeYellow
    case .stale: return themeOrange
    case .offline: return themePink
    }
}

#Preview {
    ContentView()
}
