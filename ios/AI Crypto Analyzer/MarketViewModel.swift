import Combine
import Foundation
import UserNotifications
import AudioToolbox

@MainActor
final class MarketViewModel: ObservableObject {
    @Published private(set) var fiveMinuteCandles: [Candle] = []
    @Published private(set) var fifteenMinuteCandles: [Candle] = []
    @Published private(set) var selectedChartCandles: [Candle] = []
    @Published private(set) var signal: TradingSignal = .placeholder
    @Published private(set) var activeSignalCache: TradingSignal = .placeholder
    @Published private(set) var tradeQuoteCache: TradeQuote = TradeQuote(investmentAmount: 0, entryPrice: 0, feeAndSpreadPercent: 0, slippagePercent: 0, breakevenPrice: 0, target1: 0, target2: 0, stopLoss: 0, rewardRisk: 0)
    @Published private(set) var statusMessage = "Starting ultra-fast WebSockets..."
    @Published private(set) var isLoading = false
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var dataFreshness: DataFreshness = .connecting
    @Published private(set) var marketMicrostructure: MarketMicrostructure = .empty
    
    // Dedicated Log Arrays for Dev Terminal
    @Published private(set) var devLogs: [String] = []
    @Published private(set) var restLogs: [String] = []
    
    @Published var selectedChartTimeframe: Timeframe = .oneDay
    @Published var investmentAmount: Double = 10_000
    @Published var feeAndSpreadPercent: Double = SignalEngine.defaultFeeAndSpreadPercent

    let symbol = "BTCUSDT"
    let paperTrading = PaperTradingStore()

    private let backendWebSocketService = BackendWebSocketService()

    private var lastSignalCalculationTime: Date = .distantPast
    private var lastNotifiedDecision: SignalDecision?
    private var lastLogTime: Date = .distantPast
    private var lastMicrostructureRefreshTime: Date = .distantPast
    private var clockTimer: AnyCancellable?
    private var freshnessTimer: Timer?

    init() {
        UserDefaults.standard.register(defaults: [
            "appTheme": 1,
            "buySoundID": 1054,
            "sellSoundID": 1006,
            "autoTradeEnabled": false
        ])
        startFreshnessTimer()
    }

    deinit {
        freshnessTimer?.invalidate()
        freshnessTimer = nil
    }

    private func startFreshnessTimer() {
        freshnessTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateDataFreshness()
            }
        }
    }

    private func updateDataFreshness() {
        guard let last = lastUpdated else {
            dataFreshness = .connecting
            return
        }
        let delay = Date().timeIntervalSince(last)
        if delay < 5 {
            dataFreshness = .live(delay: delay)
        } else if delay < 30 {
            dataFreshness = .delayed(delay: delay)
        } else if delay < 120 {
            dataFreshness = .stale(delay: delay)
        } else {
            dataFreshness = .offline
        }
    }

    var tradeQuote: TradeQuote { tradeQuoteCache }

    var activeSignal: TradingSignal { activeSignalCache }

    private func updateActiveSignalCache() {
        var modified = signal
        if let position = paperTrading.openPosition {
            if modified.sellScore >= 80 { modified.decision = .sellExit }
            else if modified.sellScore >= 65 { modified.decision = .considerSell }
            else { modified.decision = .hold }
            
            // Recalculate with structure-based stops using current market data
            let swingLow = SignalEngine.latestSwingLowPublic(fiveMinuteCandles: fiveMinuteCandles)
            let nextResistance = SignalEngine.nearestSwingHighAbovePricePublic(fiveMinuteCandles: fiveMinuteCandles, price: position.entryPrice * 1.005)
            let farResistance = SignalEngine.nearestSwingHighAbovePricePublic(fiveMinuteCandles: fiveMinuteCandles, price: position.entryPrice * 1.02)
            
            let quote = SignalEngine.calculateTradeQuote(
                investmentAmount: position.investedAmount,
                entryPrice: position.entryPrice,
                feeAndSpreadPercent: feeAndSpreadPercent,
                structureStopLoss: swingLow,
                structureTarget1: nextResistance,
                structureTarget2: farResistance
            )
            modified.entryPrice = quote.entryPrice
            modified.breakevenPrice = quote.breakevenPrice
            modified.stopLoss = quote.stopLoss
            modified.target1 = quote.target1
            modified.target2 = quote.target2
            modified.rewardRisk = quote.rewardRisk

            // Apply trailing stop: if active, use the higher of original stop or trailing stop
            if let trailing = modified.trailingStop.activeTrailingStop, trailing > modified.stopLoss {
                modified.stopLoss = trailing
            }
        } else {
            if signal.decision == .noTrade { modified.decision = .noTrade }
            else if modified.buyScore.total >= 85 { modified.decision = .strongBuy }
            else if modified.buyScore.total >= 75 { modified.decision = .considerBuy }
            else if modified.buyScore.total >= 60 { modified.decision = .wait }
            else { modified.decision = .noTrade }
        }
        activeSignalCache = modified
    }

    private func updateTradeQuoteCache() {
        let swingLow = SignalEngine.latestSwingLowPublic(fiveMinuteCandles: fiveMinuteCandles)
        let nextResistance = SignalEngine.nearestSwingHighAbovePricePublic(fiveMinuteCandles: fiveMinuteCandles, price: signal.entryPrice * 1.005)
        let farResistance = SignalEngine.nearestSwingHighAbovePricePublic(fiveMinuteCandles: fiveMinuteCandles, price: signal.entryPrice * 1.02)
        tradeQuoteCache = SignalEngine.calculateTradeQuote(
            investmentAmount: investmentAmount,
            entryPrice: signal.entryPrice,
            feeAndSpreadPercent: feeAndSpreadPercent,
            structureStopLoss: swingLow,
            structureTarget1: nextResistance,
            structureTarget2: farResistance
        )
    }
    
    private func addLog(_ message: String) {
        let ts = Date().formatted(date: .omitted, time: .standard)
        devLogs.insert("[\(ts)] \(message)", at: 0)
        // Keep live socket logs capped so UI doesn't lag
        if devLogs.count > 100 { devLogs.removeLast() }
    }
    
    private func addRestLog(_ message: String) {
        let ts = Date().formatted(date: .omitted, time: .standard)
        restLogs.insert("[\(ts)] \(message)", at: 0)
        if restLogs.count > 2000 { restLogs.removeLast(restLogs.count - 2000) }
    }

    private func dumpRawRestResponse(name: String, sourceURL: String, rawResponse: String) {
        let ts = Date().formatted(date: .omitted, time: .standard)
        restLogs.insert("[\(ts)] === END RAW RESPONSE: \(name) ===", at: 0)
        restLogs.insert("[\(ts)] \(rawResponse)", at: 0)
        restLogs.insert("[\(ts)] SOURCE: \(sourceURL)", at: 0)
        restLogs.insert("[\(ts)] === START RAW RESPONSE: \(name) ===", at: 0)
        if restLogs.count > 2000 { restLogs.removeLast(restLogs.count - 2000) }
    }
    
    // Custom batch dumper with exact INDEX NUMBERING for the Dev Terminal
    private func dumpRestResponse(name: String, candles: [Candle]) {
        let ts = Date().formatted(date: .omitted, time: .standard)
        var batch: [String] = []
        
        batch.append("[\(ts)] === END PARSED CANDLES: \(name) ===")
        
        for (index, c) in candles.enumerated().reversed() {
            let t = Int(c.openTime.timeIntervalSince1970 * 1000)
            let formatted = "[Candle \(index + 1)] [\(t), \"\(c.open)\", \"\(c.high)\", \"\(c.low)\", \"\(c.close)\", \"\(c.volume)\"]"
            batch.append("[\(ts)] \(formatted)")
        }
        
        batch.append("[\(ts)] === START PARSED CANDLES: \(name) (\(candles.count) ITEMS) ===")
        restLogs.insert(contentsOf: batch, at: 0)
        
        if restLogs.count > 2000 {
            restLogs.removeLast(restLogs.count - 2000)
        }
    }
    
    func reconnectAll() async {
        addLog("Manual Reconnect Triggered...")
        start()
    }

    func start() {
        NotificationManager.shared.setup()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }

        addLog("Connecting to Crypto Copilot backend...")
        connectBackendWebSocket()
        Task {
            await loadSupabaseState()
            await refreshAll()
        }
    }

    func loadSupabaseState() async {
        do {
            guard let remote = try await SupabaseService.shared.loadPaperTrades() else { return }
            paperTrading.replaceState(
                demoBalance: remote.demoBalance,
                openPosition: remote.openPosition,
                history: remote.history
            )
            addLog("Supabase user state synced.")
        } catch {
            addLog("Supabase sync unavailable: \(error.localizedDescription)")
        }
    }

    func setDemoBalance(_ balance: Double) {
        paperTrading.setDemoBalance(balance)
        updateActiveSignalCache()
        updateTradeQuoteCache()
    }

    func resetPaperTrading() {
        paperTrading.reset()
        updateActiveSignalCache()
        updateTradeQuoteCache()
    }

    func deleteClosedTrade(at indexSet: IndexSet) {
        paperTrading.deleteTrade(at: indexSet)
    }

    func refreshAll() async {
        isLoading = true
        addRestLog("Initiating backend API fetch for \(symbol)...")
        statusMessage = "Syncing BTC/USDT from backend..."

        do {
            addRestLog("-> Fetching candles and signal from backend...")
            async let fiveMinute = BackendMarketService.fetchCandles(symbol: symbol, timeframe: .fiveMinutes, limit: 300)
            async let fifteenMinute = BackendMarketService.fetchCandles(symbol: symbol, timeframe: .fifteenMinutes, limit: 200)
            async let chart = BackendMarketService.fetchCandles(symbol: symbol, timeframe: selectedChartTimeframe, limit: chartLimit(for: selectedChartTimeframe))
            async let backendSignal = BackendMarketService.fetchSignal(
                symbol: symbol,
                investmentAmount: investmentAmount,
                demoBalance: paperTrading.demoBalance,
                feeAndSpreadPercent: feeAndSpreadPercent
            )

            let new5m = try await fiveMinute
            let new15m = try await fifteenMinute
            let newChart = try await chart
            let newSignal = try await backendSignal

            addRestLog("✅ SUCCESS: Received \(new5m.count) 5m candles.")
            addRestLog("✅ SUCCESS: Received \(new15m.count) 15m candles.")
            addRestLog("✅ SUCCESS: Received \(newChart.count) chart candles.")
            dumpRestResponse(name: "5m", candles: new5m)
            dumpRestResponse(name: "15m", candles: new15m)
            dumpRestResponse(name: "Chart \(selectedChartTimeframe.rawValue)", candles: newChart)
            
            if let first = newChart.first, let last = newChart.last {
                addRestLog("NEWEST (Candle \(newChart.count)): \(last.openTime.formatted()) -> C: \(last.close)")
                addRestLog("OLDEST (Candle 1): \(first.openTime.formatted()) -> C: \(first.close)")
            }
            
            fiveMinuteCandles = new5m
            fifteenMinuteCandles = new15m
            selectedChartCandles = newChart
            signal = newSignal
            updateActiveSignalCache()
            updateTradeQuoteCache()
            handleSignalChange()

            addLog("Backend API Sync Complete")
            statusMessage = "Backend signal + live price connected"
            lastUpdated = Date()
        } catch {
            addRestLog("❌ ERROR: \(error.localizedDescription)")
            addLog("Backend API Error: \(error.localizedDescription)")
            statusMessage = "Backend unavailable. Check your internet connection or backend server."
        }

        isLoading = false
    }

    private func refreshOptionalMarketMicrostructure(shouldRecalculate: Bool, logRawResponse: Bool) async {
        do {
            let backendSignal = try await BackendMarketService.fetchSignal(
                symbol: symbol,
                investmentAmount: investmentAmount,
                demoBalance: paperTrading.demoBalance,
                feeAndSpreadPercent: feeAndSpreadPercent
            )
            signal = backendSignal
            addRestLog("✅ SUCCESS: Refreshed backend signal.")
            if logRawResponse {
                addRestLog("SOURCE: \(BackendMarketService.baseURL.absoluteString)/api/signal/\(symbol)")
            }
        } catch {
            addRestLog("Optional backend signal refresh unavailable: \(error.localizedDescription)")
        }

        lastMicrostructureRefreshTime = Date()

        if shouldRecalculate {
            updateActiveSignalCache()
            updateTradeQuoteCache()
            handleSignalChange()
        }
    }

    func loadChartTimeframe(_ timeframe: Timeframe) {
        selectedChartTimeframe = timeframe
        selectedChartCandles = []
        isLoading = true
        statusMessage = "Loading \(timeframe.title) chart..."

        addLog("Switched chart to \(timeframe.title)")
        
        Task {
            do {
                addRestLog("-> Fetching \(timeframe.rawValue) chart history from backend...")
                let chart = try await BackendMarketService.fetchCandles(symbol: symbol, timeframe: timeframe, limit: chartLimit(for: timeframe))
                selectedChartCandles = chart
                
                addRestLog("✅ SUCCESS: Received \(chart.count) chart candles.")
                dumpRestResponse(name: "Chart \(timeframe.rawValue)", candles: chart)
                if let first = chart.first, let last = chart.last {
                    addRestLog("NEWEST (Candle \(chart.count)): \(last.openTime.formatted()) -> C: \(last.close)")
                    addRestLog("OLDEST (Candle 1): \(first.openTime.formatted()) -> C: \(first.close)")
                }
                
                statusMessage = "Backend signal + live price connected"
            } catch {
                addRestLog("❌ ERROR: \(error.localizedDescription)")
                statusMessage = "Backend chart history unavailable."
            }
            isLoading = false
        }
    }

    func buyPaperTrade() -> String? {
        do {
            try paperTrading.buy(symbol: symbol, price: signal.price, amount: investmentAmount)
            lastNotifiedDecision = nil
            addLog("Manual BUY Executed at $\(signal.price)")
            return nil
        } catch { return error.localizedDescription }
    }

    func sellPaperTrade() -> Result<ClosedPaperTrade, Error> {
        do {
            let result = try paperTrading.sell(price: signal.price)
            lastNotifiedDecision = nil
            addLog("Manual SELL Executed at $\(signal.price)")
            return .success(result)
        } catch { return .failure(error) }
    }

    func sellPartialPaperTrade(percent: Double) -> Result<ClosedPaperTrade?, Error> {
        do {
            let result = try paperTrading.sellPartial(price: signal.price, percent: percent)
            lastNotifiedDecision = nil
            addLog("Partial SELL \(Int(percent))% Executed at $\(signal.price)")
            return .success(result)
        } catch { return .failure(error) }
    }

    private func connectBackendWebSocket() {
        backendWebSocketService.onPrice = { [weak self] update in
            guard let self, update.symbol == self.symbol else { return }
            self.handleBackendLivePrice(update)
        }
        backendWebSocketService.onError = { [weak self] error in
            self?.addLog(error)
        }
        backendWebSocketService.connect(symbol: symbol)
    }

    private func mergeSignalLiveCandle(_ candle: Candle) {
        lastUpdated = Date()
        updateCandles(&fiveMinuteCandles, with: candle, maxCount: 300)
        recalculateSignal()
    }

    private func mergeChartLiveCandle(_ candle: Candle) {
        lastUpdated = Date()
        updateCandles(&selectedChartCandles, with: candle, maxCount: chartLimit(for: selectedChartTimeframe))
    }
    
    private func handleLiveTrade(_ trade: TradeTick) {
        let now = Date()
        
        // Log to Dev Terminal max 1 time per second so UI doesn't lag
        if now.timeIntervalSince(lastLogTime) > 1.0 {
            addLog("Live Trade: $\(trade.price) Qty: \(trade.quantity)")
            lastLogTime = now
        }

        if now.timeIntervalSince(lastMicrostructureRefreshTime) > 30 {
            lastMicrostructureRefreshTime = now
            Task { await refreshOptionalMarketMicrostructure(shouldRecalculate: true, logRawResponse: false) }
        }
        
        let interval = seconds(for: selectedChartTimeframe)
        let startOfCandle = Date(timeIntervalSince1970: floor(trade.time.timeIntervalSince1970 / interval) * interval)
        
        // 1. Update the visual UI chart (up to 1,000 candles)
        if let lastIndex = selectedChartCandles.indices.last, selectedChartCandles[lastIndex].openTime == startOfCandle {
            let last = selectedChartCandles[lastIndex]
            selectedChartCandles[lastIndex] = Candle(
                openTime: last.openTime, open: last.open, high: max(last.high, trade.price),
                low: min(last.low, trade.price), close: trade.price, volume: last.volume + trade.quantity
            )
        } else {
            let open = selectedChartCandles.last?.close ?? trade.price
            selectedChartCandles.append(Candle(
                openTime: startOfCandle, open: open, high: trade.price,
                low: trade.price, close: trade.price, volume: trade.quantity
            ))
            if selectedChartCandles.count > chartLimit(for: selectedChartTimeframe) {
                selectedChartCandles.removeFirst()
            }
        }
        
        // 2. Update the hidden 5m AI Array (Strictly capped at 300 candles)
        let m5Interval = seconds(for: .fiveMinutes)
        let m5Start = Date(timeIntervalSince1970: floor(trade.time.timeIntervalSince1970 / m5Interval) * m5Interval)
        if let idx = fiveMinuteCandles.indices.last, fiveMinuteCandles[idx].openTime == m5Start {
            let c = fiveMinuteCandles[idx]
            fiveMinuteCandles[idx] = Candle(openTime: c.openTime, open: c.open, high: max(c.high, trade.price), low: min(c.low, trade.price), close: trade.price, volume: c.volume + trade.quantity)
        } else {
            fiveMinuteCandles.append(Candle(openTime: m5Start, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.quantity))
            if fiveMinuteCandles.count > 300 { fiveMinuteCandles.removeFirst() }
        }
        
        // 3. Update the hidden 15m AI Array (Strictly capped at 200 candles)
        let m15Interval = seconds(for: .fifteenMinutes)
        let m15Start = Date(timeIntervalSince1970: floor(trade.time.timeIntervalSince1970 / m15Interval) * m15Interval)
        if let idx = fifteenMinuteCandles.indices.last, fifteenMinuteCandles[idx].openTime == m15Start {
            let c = fifteenMinuteCandles[idx]
            fifteenMinuteCandles[idx] = Candle(openTime: c.openTime, open: c.open, high: max(c.high, trade.price), low: min(c.low, trade.price), close: trade.price, volume: c.volume + trade.quantity)
        } else {
            fifteenMinuteCandles.append(Candle(openTime: m15Start, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.quantity))
            if fifteenMinuteCandles.count > 200 { fifteenMinuteCandles.removeFirst() }
        }
        
        // Recalculate math 4x a second
        if now.timeIntervalSince(lastSignalCalculationTime) > 0.25 {
            lastSignalCalculationTime = now
            recalculateSignal()
        }
        
        lastUpdated = now
    }

    private func handleBackendLivePrice(_ update: BackendLivePriceUpdate) {
        let now = Date()
        if now.timeIntervalSince(lastLogTime) > 1.0 {
            addLog("Backend Live Price: $\(update.price)")
            lastLogTime = now
        }

        updateLiveCandleArrays(price: update.price, quantity: 0, time: now)

        if now.timeIntervalSince(lastSignalCalculationTime) > 15 {
            lastSignalCalculationTime = now
            Task { await refreshOptionalMarketMicrostructure(shouldRecalculate: true, logRawResponse: false) }
        }

        lastUpdated = now
    }

    private func updateLiveCandleArrays(price: Double, quantity: Double, time: Date) {
        let interval = seconds(for: selectedChartTimeframe)
        let startOfCandle = Date(timeIntervalSince1970: floor(time.timeIntervalSince1970 / interval) * interval)

        if let lastIndex = selectedChartCandles.indices.last, selectedChartCandles[lastIndex].openTime == startOfCandle {
            let last = selectedChartCandles[lastIndex]
            selectedChartCandles[lastIndex] = Candle(
                openTime: last.openTime,
                open: last.open,
                high: max(last.high, price),
                low: min(last.low, price),
                close: price,
                volume: last.volume + quantity
            )
        } else {
            let open = selectedChartCandles.last?.close ?? price
            selectedChartCandles.append(Candle(
                openTime: startOfCandle,
                open: open,
                high: max(open, price),
                low: min(open, price),
                close: price,
                volume: quantity
            ))
            if selectedChartCandles.count > chartLimit(for: selectedChartTimeframe) {
                selectedChartCandles.removeFirst()
            }
        }

        let m5Interval = seconds(for: .fiveMinutes)
        let m5Start = Date(timeIntervalSince1970: floor(time.timeIntervalSince1970 / m5Interval) * m5Interval)
        mergeLiveCandle(&fiveMinuteCandles, openTime: m5Start, price: price, quantity: quantity, maxCount: 300)

        let m15Interval = seconds(for: .fifteenMinutes)
        let m15Start = Date(timeIntervalSince1970: floor(time.timeIntervalSince1970 / m15Interval) * m15Interval)
        mergeLiveCandle(&fifteenMinuteCandles, openTime: m15Start, price: price, quantity: quantity, maxCount: 200)
    }

    private func mergeLiveCandle(_ candles: inout [Candle], openTime: Date, price: Double, quantity: Double, maxCount: Int) {
        if let idx = candles.indices.last, candles[idx].openTime == openTime {
            let c = candles[idx]
            candles[idx] = Candle(
                openTime: c.openTime,
                open: c.open,
                high: max(c.high, price),
                low: min(c.low, price),
                close: price,
                volume: c.volume + quantity
            )
        } else {
            let open = candles.last?.close ?? price
            candles.append(Candle(openTime: openTime, open: open, high: price, low: price, close: price, volume: quantity))
            if candles.count > maxCount { candles.removeFirst() }
        }
    }

    private func updateCandles(_ candles: inout [Candle], with candle: Candle, maxCount: Int) {
        if let index = candles.firstIndex(where: { $0.openTime == candle.openTime }) {
            candles[index] = candle
        } else {
            candles.append(candle)
            if candles.count > maxCount {
                candles.removeFirst(candles.count - maxCount)
            }
        }
    }

    private func recalculateSignal() {
        signal = SignalEngine.analyze(
            symbol: symbol,
            fiveMinuteCandles: fiveMinuteCandles,
            fifteenMinuteCandles: fifteenMinuteCandles,
            feeAndSpreadPercent: feeAndSpreadPercent,
            investmentAmount: investmentAmount,
            demoBalance: paperTrading.demoBalance,
            activeEntryPrice: paperTrading.openPosition?.entryPrice,
            activeInvestmentAmount: paperTrading.openPosition?.investedAmount,
            marketMicrostructure: marketMicrostructure
        )
        
        updateActiveSignalCache()
        updateTradeQuoteCache()
        handleSignalChange()
    }
    
    private func handleSignalChange() {
        let currentDecision = activeSignal.decision
        guard currentDecision != lastNotifiedDecision else { return }
        lastNotifiedDecision = currentDecision
        
        let isAutoTradeEnabled = UserDefaults.standard.bool(forKey: "autoTradeEnabled")
        var actionText = ""
        
        let content = UNMutableNotificationContent()
        content.sound = .default
        
        if currentDecision == .strongBuy || currentDecision == .considerBuy {
            addLog("AI SIGNAL: \(currentDecision.rawValue)")
            if isAutoTradeEnabled && paperTrading.openPosition == nil {
                do {
                    try paperTrading.buy(symbol: symbol, price: activeSignal.price, amount: investmentAmount)
                    actionText = " Auto-trade executed!"
                    addLog("AUTO-TRADE: Bought at $\(activeSignal.price)")
                } catch { 
                    addLog("AUTO-TRADE FAILED: \(error.localizedDescription)")
                }
            }
            
            content.title = "🚀 Time to Buy BTC!"
            content.body = "The AI Signal is now \(currentDecision.rawValue) at \(AppFormatters.peso(activeSignal.price)).\(actionText)"
            
            let soundID = UInt32(UserDefaults.standard.integer(forKey: "buySoundID"))
            if soundID > 0 { playSoundLong(soundID) }
            
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request)
            
        } else if currentDecision == .sellExit || currentDecision == .considerSell {
            addLog("AI SIGNAL: \(currentDecision.rawValue)")
            if isAutoTradeEnabled && paperTrading.openPosition != nil {
                do {
                    let _ = try paperTrading.sell(price: activeSignal.price)
                    actionText = " Auto-trade executed!"
                    addLog("AUTO-TRADE: Sold at $\(activeSignal.price)")
                } catch { 
                    addLog("AUTO-TRADE FAILED: \(error.localizedDescription)")
                }
            }
            
            content.title = "⚠️ Time to Sell BTC!"
            content.body = "The AI Signal is now \(currentDecision.rawValue) at \(AppFormatters.peso(activeSignal.price)). Take profit or exit.\(actionText)"
            
            let soundID = UInt32(UserDefaults.standard.integer(forKey: "sellSoundID"))
            if soundID > 0 { playSoundLong(soundID) }
            
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request)
        }
    }

    private func playSoundLong(_ soundID: UInt32) {
        Task {
            for _ in 0..<4 {
                AudioServicesPlaySystemSound(soundID)
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
        }
    }

    private func chartLimit(for timeframe: Timeframe) -> Int {
        return 1000
    }
    
    private func seconds(for timeframe: Timeframe) -> TimeInterval {
        switch timeframe {
        case .oneSecond: return 1
        case .oneMinute: return 60
        case .fiveMinutes: return 300
        case .fifteenMinutes: return 900
        case .oneHour: return 3600
        case .fourHours: return 14400
        case .oneDay: return 86400
        }
    }
}
