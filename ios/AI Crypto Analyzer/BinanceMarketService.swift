import Foundation

enum BinanceMarketError: LocalizedError {
    case invalidURL
    case requestFailed(String)
    case invalidPayload
    case unsupportedInterval(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Unable to create Binance API URL."
        case .requestFailed(let message): return message
        case .invalidPayload: return "Binance returned market data in an unexpected format."
        case .unsupportedInterval(let interval): return "Binance does not support \(interval) candles on this endpoint."
        }
    }
}

enum BinanceMarketService {
    // Google Cloud (api-gcp) is prioritized because it supports true 1-second history natively!
    private static let restBaseURLs = [
        "https://api-gcp.binance.com",
        "https://api.binance.com",
        "https://api1.binance.com",
        "https://api.binance.us"
    ]

    struct CandleFetchResult {
        let candles: [Candle]
        let rawResponse: String
        let sourceURL: String
    }

    struct BookTickerFetchResult {
        let ticker: BookTicker
        let rawResponse: String
        let sourceURL: String
    }

    struct DepthFetchResult {
        let orderBook: OrderBookSnapshot
        let rawResponse: String
        let sourceURL: String
    }

    static func fetchCandles(
        symbol: String,
        timeframe: Timeframe,
        limit: Int = 100
    ) async throws -> [Candle] {
        try await fetchCandlesDetailed(symbol: symbol, timeframe: timeframe, limit: limit).candles
    }

    static func fetchCandlesDetailed(
        symbol: String,
        timeframe: Timeframe,
        limit: Int = 100
    ) async throws -> CandleFetchResult {
        var lastError: Error?

        // 1. Try to fetch standard klines first (even for 1s, since GCP supports it)
        for baseURL in restBaseURLs {
            do {
                let result = try await fetchKlines(
                    baseURL: baseURL,
                    symbol: symbol,
                    timeframe: timeframe,
                    limit: limit
                )
                if !result.candles.isEmpty { return result }
            } catch {
                lastError = error
                continue
            }
        }
        
        // 2. If Klines completely fail (like on Binance.US), manually build 1s from recent trades
        if timeframe == .oneSecond {
            return try await fetchOneSecondFromTrades(symbol: symbol, limit: limit)
        }

        throw lastError ?? BinanceMarketError.invalidPayload
    }

    static func fetchBookTickerDetailed(symbol: String) async throws -> BookTickerFetchResult {
        var lastError: Error?

        for baseURL in restBaseURLs {
            do {
                return try await fetchBookTicker(baseURL: baseURL, symbol: symbol)
            } catch {
                lastError = error
            }
        }

        throw lastError ?? BinanceMarketError.invalidPayload
    }

    static func fetchDepthDetailed(symbol: String, limit: Int = 20) async throws -> DepthFetchResult {
        var lastError: Error?

        for baseURL in restBaseURLs {
            do {
                return try await fetchDepth(baseURL: baseURL, symbol: symbol, limit: limit)
            } catch {
                lastError = error
            }
        }

        throw lastError ?? BinanceMarketError.invalidPayload
    }

    private static func fetchOneSecondFromTrades(symbol: String, limit: Int) async throws -> CandleFetchResult {
        let tradeLimit = max(limit * 4, 1000)
        var lastError: Error?

        for baseURL in restBaseURLs {
            do {
                let tradeResult = try await fetchRecentTrades(
                    baseURL: baseURL,
                    symbol: symbol,
                    limit: tradeLimit
                )
                let candles = aggregateTradesIntoSecondCandles(tradeResult.trades).suffix(limit)
                if !candles.isEmpty {
                    return CandleFetchResult(
                        candles: Array(candles),
                        rawResponse: tradeResult.rawResponse,
                        sourceURL: tradeResult.sourceURL
                    )
                }
            } catch {
                lastError = error
            }
        }
        throw lastError ?? BinanceMarketError.invalidPayload
    }

    private static func fetchKlines(
        baseURL: String,
        symbol: String,
        timeframe: Timeframe,
        limit: Int
    ) async throws -> CandleFetchResult {
        var components = URLComponents(string: "\(baseURL)/api/v3/klines")
        components?.queryItems = [
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "interval", value: timeframe.rawValue),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        guard let url = components?.url else { throw BinanceMarketError.invalidURL }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 4
        request.cachePolicy = .reloadIgnoringLocalCacheData 

        let (data, response) = try await URLSession.shared.data(for: request)
        if let response = response as? HTTPURLResponse, !(200...299).contains(response.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw BinanceMarketError.requestFailed("Binance HTTP \(response.statusCode): \(body)")
        }

        let payload = try JSONSerialization.jsonObject(with: data)
        guard let rows = payload as? [[Any]] else { throw BinanceMarketError.invalidPayload }

        let candles: [Candle] = rows.compactMap { row -> Candle? in
            guard row.count >= 6,
                  let openTime = doubleValue(row[0]),
                  let open = doubleValue(row[1]),
                  let high = doubleValue(row[2]),
                  let low = doubleValue(row[3]),
                  let close = doubleValue(row[4]),
                  let volume = doubleValue(row[5]) else {
                return nil
            }
            return Candle(
                openTime: Date(timeIntervalSince1970: openTime / 1000),
                open: open, high: high, low: low, close: close, volume: volume
            )
        }

        return CandleFetchResult(
            candles: candles,
            rawResponse: String(data: data, encoding: .utf8) ?? "Unable to decode raw response.",
            sourceURL: url.absoluteString
        )
    }

    private static func fetchBookTicker(baseURL: String, symbol: String) async throws -> BookTickerFetchResult {
        var components = URLComponents(string: "\(baseURL)/api/v3/ticker/bookTicker")
        components?.queryItems = [
            URLQueryItem(name: "symbol", value: symbol)
        ]

        guard let url = components?.url else { throw BinanceMarketError.invalidURL }
        let data = try await fetchData(from: url)
        let response = try JSONDecoder().decode(BinanceBookTickerResponse.self, from: data)

        guard let bidPrice = Double(response.bidPrice),
              let bidQuantity = Double(response.bidQty),
              let askPrice = Double(response.askPrice),
              let askQuantity = Double(response.askQty) else {
            throw BinanceMarketError.invalidPayload
        }

        return BookTickerFetchResult(
            ticker: BookTicker(
                symbol: response.symbol,
                bidPrice: bidPrice,
                bidQuantity: bidQuantity,
                askPrice: askPrice,
                askQuantity: askQuantity
            ),
            rawResponse: String(data: data, encoding: .utf8) ?? "Unable to decode raw response.",
            sourceURL: url.absoluteString
        )
    }

    private static func fetchDepth(baseURL: String, symbol: String, limit: Int) async throws -> DepthFetchResult {
        var components = URLComponents(string: "\(baseURL)/api/v3/depth")
        components?.queryItems = [
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        guard let url = components?.url else { throw BinanceMarketError.invalidURL }
        let data = try await fetchData(from: url)
        let response = try JSONDecoder().decode(BinanceDepthResponse.self, from: data)

        return DepthFetchResult(
            orderBook: OrderBookSnapshot(
                lastUpdateId: response.lastUpdateId,
                bids: parseOrderBookLevels(response.bids),
                asks: parseOrderBookLevels(response.asks)
            ),
            rawResponse: String(data: data, encoding: .utf8) ?? "Unable to decode raw response.",
            sourceURL: url.absoluteString
        )
    }

    private static func fetchData(from url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 4
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        if let response = response as? HTTPURLResponse, !(200...299).contains(response.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw BinanceMarketError.requestFailed("Binance HTTP \(response.statusCode): \(body)")
        }
        return data
    }

    private static func parseOrderBookLevels(_ rows: [[String]]) -> [OrderBookLevel] {
        rows.compactMap { row in
            guard row.count >= 2,
                  let price = Double(row[0]),
                  let quantity = Double(row[1]) else {
                return nil
            }
            return OrderBookLevel(price: price, quantity: quantity)
        }
    }

    private struct RecentTradeFetchResult {
        let trades: [BinanceRecentTrade]
        let rawResponse: String
        let sourceURL: String
    }

    private static func fetchRecentTrades(
        baseURL: String,
        symbol: String,
        limit: Int
    ) async throws -> RecentTradeFetchResult {
        var components = URLComponents(string: "\(baseURL)/api/v3/trades")
        components?.queryItems = [
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        guard let url = components?.url else { throw BinanceMarketError.invalidURL }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 4
        request.cachePolicy = .reloadIgnoringLocalCacheData 

        let (data, response) = try await URLSession.shared.data(for: request)
        if let response = response as? HTTPURLResponse, !(200...299).contains(response.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw BinanceMarketError.requestFailed("Binance HTTP \(response.statusCode): \(body)")
        }

        return RecentTradeFetchResult(
            trades: try JSONDecoder().decode([BinanceRecentTrade].self, from: data),
            rawResponse: String(data: data, encoding: .utf8) ?? "Unable to decode raw response.",
            sourceURL: url.absoluteString
        )
    }

    private static func aggregateTradesIntoSecondCandles(_ trades: [BinanceRecentTrade]) -> [Candle] {
        let sortedTrades = trades.sorted { $0.resolvedTime < $1.resolvedTime }
        var candles: [Candle] = []

        for trade in sortedTrades {
            let secondStart = Date(timeIntervalSince1970: floor(Double(trade.resolvedTime) / 1000))
            let price = Double(trade.resolvedPrice) ?? 0
            let volume = Double(trade.resolvedQuantity) ?? 0
            guard price > 0 else { continue }

            if let lastIndex = candles.indices.last, candles[lastIndex].openTime == secondStart {
                let last = candles[lastIndex]
                candles[lastIndex] = Candle(
                    openTime: last.openTime, open: last.open, high: max(last.high, price),
                    low: min(last.low, price), close: price, volume: last.volume + volume
                )
            } else {
                let openPrice = candles.last?.close ?? price
                candles.append(Candle(
                    openTime: secondStart, open: openPrice, high: price,
                    low: price, close: price, volume: volume
                ))
            }
        }
        return candles
    }

    private static func doubleValue(_ value: Any) -> Double? {
        if let double = value as? Double { return double }
        if let string = value as? String { return Double(string) }
        if let number = value as? NSNumber { return number.doubleValue }
        return nil
    }
}

private struct BinanceBookTickerResponse: Decodable {
    let symbol: String
    let bidPrice: String
    let bidQty: String
    let askPrice: String
    let askQty: String
}

private struct BinanceDepthResponse: Decodable {
    let lastUpdateId: Int
    let bids: [[String]]
    let asks: [[String]]
}

// MARK: - WEBSOCKETS

struct TradeTick: Equatable {
    let time: Date
    let price: Double
    let quantity: Double
}

final class BinanceWebSocketService {
    private var task: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var lastMessageTime: Date = .distantPast
    private var isDisconnected = false
    
    private let wssBaseURLs = [
        "wss://stream1.binance.com:443",     // Spot GCP Cluster (Best for spot)
        "wss://stream.binance.com:9443",     // Spot Main
        "wss://fstream.binance.com:443",     // Futures (Fallback)
        "wss://stream.binance.us:9443"       // US Spot (Never Blocked)
    ]
    
    private var urlIndex = 0
    private var symbol = ""
    private var timeframe = Timeframe.fiveMinutes
    private var onCandle: ((Candle) -> Void)?
    private var onError: ((String) -> Void)?

    func connect(
        symbol: String,
        timeframe: Timeframe,
        onCandle: @escaping @MainActor (Candle) -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) {
        disconnect()
        self.symbol = symbol
        self.timeframe = timeframe
        self.onCandle = onCandle
        self.onError = onError
        self.urlIndex = 0
        self.isDisconnected = false
        connectToCurrentURL()
        startPing()
    }
    
    private func connectToCurrentURL() {
        let stream = "\(symbol.lowercased())@kline_\(timeframe.rawValue)"
        let baseURL = wssBaseURLs[urlIndex]
        
        guard let url = URL(string: "\(baseURL)/ws/\(stream)") else { return }

        task = URLSession.shared.webSocketTask(with: url)
        task?.resume()
        lastMessageTime = Date()
        receive()
    }

    func disconnect() {
        isDisconnected = true
        pingTimer?.invalidate()
        pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }
    
    // MARK: - Keepalive Ping
    private func startPing() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            self?.sendPing()
            self?.checkConnectionHealth()
        }
    }
    
    private func sendPing() {
        task?.sendPing { [weak self] error in
            if let error = error {
                print("WebSocket ping failed: \(error.localizedDescription)")
                self?.handleDisconnect(reason: "Ping failed")
            }
        }
    }
    
    private func checkConnectionHealth() {
        let staleSeconds = Date().timeIntervalSince(lastMessageTime)
        // If no message received for 60 seconds, connection is likely dead
        if staleSeconds > 60 && !isDisconnected {
            handleDisconnect(reason: "No data for \(Int(staleSeconds))s")
        }
    }
    
    private func handleDisconnect(reason: String) {
        Task { @MainActor in
            self.onError?("Connection lost: \(reason). Reconnecting...")
        }
        
        // Try next server
        urlIndex += 1
        if urlIndex < wssBaseURLs.count {
            connectToCurrentURL()
        } else {
            urlIndex = 0
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.connectToCurrentURL()
            }
        }
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self = self, !self.isDisconnected else { return }

            switch result {
            case .success(let message):
                self.lastMessageTime = Date()
                if let candle = Self.decode(message: message) {
                    Task { @MainActor in self.onCandle?(candle) }
                }
                self.receive()
                
            case .failure(_):
                self.handleDisconnect(reason: "Receive error")
            }
        }
    }

    private static func decode(message: URLSessionWebSocketTask.Message) -> Candle? {
        let data: Data?
        switch message {
        case .data(let payload): data = payload
        case .string(let payload): data = payload.data(using: .utf8)
        @unknown default: data = nil
        }
        guard let data else { return nil }
        guard let msg = try? JSONDecoder().decode(BinanceKlineMessage.self, from: data) else { return nil }
        return msg.candle
    }
}

final class BinanceTradeWebSocketService {
    private var task: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var lastMessageTime: Date = .distantPast
    private var isDisconnected = false
    
    private let wssBaseURLs = [
        "wss://stream1.binance.com:443",     // Spot GCP Cluster (Best for spot)
        "wss://stream.binance.com:9443",     // Spot Main
        "wss://fstream.binance.com:443",     // Futures (Fallback)
        "wss://stream.binance.us:9443"       // US Spot (Never Blocked)
    ]
    
    private var urlIndex = 0
    private var symbol = ""
    private var onTrade: ((TradeTick) -> Void)?
    private var onError: ((String) -> Void)?

    func connect(
        symbol: String,
        onTrade: @escaping @MainActor (TradeTick) -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) {
        disconnect()
        self.symbol = symbol
        self.onTrade = onTrade
        self.onError = onError
        self.urlIndex = 0
        self.isDisconnected = false
        connectToCurrentURL()
        startPing()
    }
    
    private func connectToCurrentURL() {
        let stream = "\(symbol.lowercased())@aggTrade"
        let baseURL = wssBaseURLs[urlIndex]
        
        guard let url = URL(string: "\(baseURL)/ws/\(stream)") else { return }

        task = URLSession.shared.webSocketTask(with: url)
        task?.resume()
        lastMessageTime = Date()
        receive()
    }

    func disconnect() {
        isDisconnected = true
        pingTimer?.invalidate()
        pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }
    
    // MARK: - Keepalive Ping
    private func startPing() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            self?.sendPing()
            self?.checkConnectionHealth()
        }
    }
    
    private func sendPing() {
        task?.sendPing { [weak self] error in
            if let error = error {
                print("Trade WebSocket ping failed: \(error.localizedDescription)")
                self?.handleDisconnect(reason: "Ping failed")
            }
        }
    }
    
    private func checkConnectionHealth() {
        let staleSeconds = Date().timeIntervalSince(lastMessageTime)
        // Trade stream should get messages very frequently (BTC trades every second)
        // If no message for 30 seconds, connection is likely dead
        if staleSeconds > 30 && !isDisconnected {
            handleDisconnect(reason: "No trades for \(Int(staleSeconds))s")
        }
    }
    
    private func handleDisconnect(reason: String) {
        Task { @MainActor in
            self.onError?("Connection lost: \(reason). Reconnecting...")
        }
        
        urlIndex += 1
        if urlIndex < wssBaseURLs.count {
            connectToCurrentURL()
        } else {
            urlIndex = 0
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.connectToCurrentURL()
            }
        }
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self = self, !self.isDisconnected else { return }

            switch result {
            case .success(let message):
                self.lastMessageTime = Date()
                if let trade = Self.decode(message: message) {
                    Task { @MainActor in self.onTrade?(trade) }
                }
                self.receive()
                
            case .failure(_):
                self.handleDisconnect(reason: "Receive error")
            }
        }
    }

    private static func decode(message: URLSessionWebSocketTask.Message) -> TradeTick? {
        let data: Data?
        switch message {
        case .data(let payload): data = payload
        case .string(let payload): data = payload.data(using: .utf8)
        @unknown default: data = nil
        }
        guard let data else { return nil }
        guard let msg = try? JSONDecoder().decode(BinanceTradeMessage.self, from: data) else { return nil }
        return msg.trade
    }
}

// MARK: - Bulletproof Universal Decoder Models

private struct BinanceRecentTrade: Decodable {
    let price: String?
    let p: String?
    let qty: String?
    let q: String?
    let time: Int?
    let T: Int?
    
    var resolvedPrice: String { price ?? p ?? "0" }
    var resolvedQuantity: String { qty ?? q ?? "0" }
    var resolvedTime: Int { time ?? T ?? 0 }
}

private struct BinanceTradeMessage: Decodable {
    let p: String? // Price
    let q: String? // Quantity
    let T: Int?    // Trade time
    let E: Int?    // Event time

    var trade: TradeTick? {
        guard let priceStr = p, let price = Double(priceStr),
              let qtyStr = q, let quantity = Double(qtyStr) else { return nil }
        
        let timestamp = T ?? E ?? Int(Date().timeIntervalSince1970 * 1000)
        return TradeTick(
            time: Date(timeIntervalSince1970: Double(timestamp) / 1000),
            price: price,
            quantity: quantity
        )
    }
}

private struct BinanceKlineMessage: Decodable {
    let k: BinanceKline?

    var candle: Candle? {
        guard let kline = k,
              let t = kline.t,
              let o = Double(kline.o ?? "0"),
              let h = Double(kline.h ?? "0"),
              let l = Double(kline.l ?? "0"),
              let c = Double(kline.c ?? "0"),
              let v = Double(kline.v ?? "0") else { return nil }
        
        return Candle(
            openTime: Date(timeIntervalSince1970: Double(t) / 1000),
            open: o, high: h, low: l, close: c, volume: v
        )
    }
}

private struct BinanceKline: Decodable {
    let t: Int?
    let o: String?
    let h: String?
    let l: String?
    let c: String?
    let v: String?
}
