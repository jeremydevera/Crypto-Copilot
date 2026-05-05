import Foundation

struct BackendLivePriceUpdate {
    let symbol: String
    let price: Double
    let bidPrice: Double
    let askPrice: Double
}

final class BackendWebSocketService {
    private var task: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var isDisconnected = false
    private var symbols = Set<String>()

    var onPrice: (@MainActor (BackendLivePriceUpdate) -> Void)?
    var onError: (@MainActor (String) -> Void)?

    private var wsURL: URL {
        let raw = ProcessInfo.processInfo.environment["CRYPTO_COPILOT_WS_URL"]
            ?? "wss://trading-copilot-backend-1p9r.onrender.com/ws"
        return URL(string: raw)!
    }

    func connect(symbol: String) {
        symbols.insert(symbol)
        guard task == nil else {
            subscribe(symbol)
            return
        }

        isDisconnected = false
        let nextTask = URLSession.shared.webSocketTask(with: wsURL)
        task = nextTask
        nextTask.resume()
        receive()
        subscribe(symbol)
    }

    func subscribe(_ symbol: String) {
        symbols.insert(symbol)
        let payload = #"{"type":"subscribe","symbol":"\#(symbol)"}"#
        task?.send(.string(payload)) { [weak self] error in
            guard let error else { return }
            Task { @MainActor in self?.onError?("Backend WS subscribe failed: \(error.localizedDescription)") }
        }
    }

    func disconnect() {
        isDisconnected = true
        reconnectTask?.cancel()
        reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                self.handle(message)
                if !self.isDisconnected {
                    self.receive()
                }
            case .failure(let error):
                Task { @MainActor in self.onError?("Backend WS error: \(error.localizedDescription)") }
                self.scheduleReconnect()
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case .data(let value):
            data = value
        case .string(let value):
            data = value.data(using: .utf8)
        @unknown default:
            data = nil
        }

        guard let data,
              let dto = try? JSONDecoder().decode(BackendLivePriceDTO.self, from: data),
              dto.type == "price" else {
            return
        }

        let update = BackendLivePriceUpdate(
            symbol: dto.symbol,
            price: dto.price,
            bidPrice: dto.bidPrice,
            askPrice: dto.askPrice
        )

        Task { @MainActor in
            self.onPrice?(update)
        }
    }

    private func scheduleReconnect() {
        guard !isDisconnected, reconnectTask == nil else { return }
        task = nil
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard let self, !Task.isCancelled, !self.isDisconnected else { return }
            let activeSymbols = self.symbols
            self.reconnectTask = nil
            for symbol in activeSymbols {
                self.connect(symbol: symbol)
            }
        }
    }
}

private struct BackendLivePriceDTO: Decodable {
    let type: String
    let symbol: String
    let price: Double
    let bidPrice: Double
    let askPrice: Double
}
