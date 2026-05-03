import Combine
import Foundation
import SwiftUI

@MainActor
final class PaperTradingStore: ObservableObject {
    @Published var demoBalance: Double {
        didSet { saveToDisk() }
    }
    @Published private(set) var openPosition: PaperPosition? {
        didSet { saveToDisk() }
    }
    @Published private(set) var history: [ClosedPaperTrade] {
        didSet { saveToDisk() }
    }

    private let feePercent: Double
    private let slippagePercent: Double
    private let defaults = UserDefaults.standard

    init(feePercent: Double = 0.1, slippagePercent: Double = 0.05) {
        self.feePercent = feePercent
        self.slippagePercent = slippagePercent
        
        // Automatically load saved data, or use defaults
        self.demoBalance = defaults.object(forKey: "savedDemoBalance") as? Double ?? 100_000
        
        if let posData = defaults.data(forKey: "savedOpenPosition"),
           let pos = try? JSONDecoder().decode(PaperPosition.self, from: posData) {
            self.openPosition = pos
        } else {
            self.openPosition = nil
        }
        
        if let histData = defaults.data(forKey: "savedHistory"),
           let hist = try? JSONDecoder().decode([ClosedPaperTrade].self, from: histData) {
            self.history = hist
        } else {
            self.history = []
        }
    }

    var totalProfit: Double {
        history.reduce(0) { $0 + $1.profit }
    }

    var winRate: Double {
        guard !history.isEmpty else { return 0 }
        let wins = history.filter { $0.profit > 0 }.count
        return Double(wins) / Double(history.count) * 100
    }

    func buy(symbol: String, price: Double, amount: Double) throws {
        guard openPosition == nil else { throw PaperTradingError.positionAlreadyOpen }
        guard price > 0 else { throw PaperTradingError.invalidPrice }
        guard amount > 0 else { throw PaperTradingError.invalidAmount }
        guard amount <= demoBalance else { throw PaperTradingError.insufficientBalance }

        // Apply slippage: buy at a slightly worse price
        let slippedPrice = price * (1 + slippagePercent / 100)
        let buyFee = amount * feePercent / 100
        let usableAmount = amount - buyFee
        let quantity = usableAmount / slippedPrice

        demoBalance -= amount
        openPosition = PaperPosition(
            id: UUID(),
            symbol: symbol,
            entryDate: Date(),
            entryPrice: slippedPrice,
            investedAmount: amount,
            buyFee: buyFee,
            quantity: quantity,
            remainingQuantity: quantity
        )
        syncRemoteOpenPosition()
        syncRemoteConfig()
    }

    @discardableResult
    func sell(price: Double) throws -> ClosedPaperTrade {
        guard let position = openPosition else { throw PaperTradingError.noOpenPosition }
        guard price > 0 else { throw PaperTradingError.invalidPrice }

        // Apply slippage: sell at a slightly worse price
        let slippedPrice = price * (1 - slippagePercent / 100)
        let grossSellValue = position.remainingQuantity * slippedPrice
        let sellFee = grossSellValue * feePercent / 100
        let netSellValue = grossSellValue - sellFee
        let costBasis = position.investedAmount * (position.remainingQuantity / position.quantity)
        let profit = netSellValue - costBasis

        demoBalance += netSellValue
        let closedTrade = ClosedPaperTrade(
            id: UUID(),
            symbol: position.symbol,
            entryDate: position.entryDate,
            exitDate: Date(),
            entryPrice: position.entryPrice,
            exitPrice: slippedPrice,
            investedAmount: costBasis,
            buyFee: position.buyFee * (position.remainingQuantity / position.quantity),
            sellFee: sellFee,
            quantity: position.remainingQuantity,
            profit: profit
        )

        history.insert(closedTrade, at: 0)
        openPosition = nil
        syncRemoteClosedTrade(closedTrade)
        syncRemoteOpenPosition()
        syncRemoteConfig()
        return closedTrade
    }

    /// Sell a percentage of the current position (partial profit taking)
    func sellPartial(price: Double, percent: Double) throws -> ClosedPaperTrade? {
        guard let position = openPosition else { throw PaperTradingError.noOpenPosition }
        guard price > 0 else { throw PaperTradingError.invalidPrice }
        guard percent > 0, percent < 100 else { throw PaperTradingError.invalidPartialPercent }

        let slippedPrice = price * (1 - slippagePercent / 100)
        let sellQuantity = position.remainingQuantity * (percent / 100)
        let grossSellValue = sellQuantity * slippedPrice
        let sellFee = grossSellValue * feePercent / 100
        let netSellValue = grossSellValue - sellFee
        let costBasis = position.investedAmount * (sellQuantity / position.quantity)
        let profit = netSellValue - costBasis

        let closedTrade = ClosedPaperTrade(
            id: UUID(),
            symbol: position.symbol,
            entryDate: position.entryDate,
            exitDate: Date(),
            entryPrice: position.entryPrice,
            exitPrice: slippedPrice,
            investedAmount: costBasis,
            buyFee: position.buyFee * (sellQuantity / position.quantity),
            sellFee: sellFee,
            quantity: sellQuantity,
            profit: profit
        )

        history.insert(closedTrade, at: 0)
        var updatedPosition = openPosition!
        updatedPosition.remainingQuantity -= sellQuantity

        // If remaining quantity is negligible, close the position
        if updatedPosition.remainingQuantity * slippedPrice < 1.0 {
            openPosition = nil
        } else {
            openPosition = updatedPosition
        }

        syncRemoteClosedTrade(closedTrade)
        syncRemoteOpenPosition()
        syncRemoteConfig()
        return closedTrade
    }

    func unrealizedProfit(currentPrice: Double) -> Double {
        guard let position = openPosition, currentPrice > 0 else { return 0 }
        let slippedSellPrice = currentPrice * (1 - slippagePercent / 100)
        let grossSellValue = position.remainingQuantity * slippedSellPrice
        let sellFee = grossSellValue * feePercent / 100
        let costBasis = position.investedAmount * (position.remainingQuantity / position.quantity)
        return grossSellValue - sellFee - costBasis
    }

    func reset(balance: Double = 100_000) {
        demoBalance = balance
        openPosition = nil
        history = []
        Task {
            await SupabaseService.shared.clearPaperTrades()
            await SupabaseService.shared.saveUserConfig(accountSize: balance)
        }
    }
    
    func deleteTrade(at indexSet: IndexSet) {
        let removed = indexSet.compactMap { history.indices.contains($0) ? history[$0] : nil }
        history.remove(atOffsets: indexSet)
        for trade in removed {
            Task { await SupabaseService.shared.deleteClosedTrade(id: trade.id) }
        }
    }

    func setDemoBalance(_ balance: Double) {
        demoBalance = balance
        syncRemoteConfig()
    }

    func replaceState(demoBalance: Double, openPosition: PaperPosition?, history: [ClosedPaperTrade]) {
        self.demoBalance = demoBalance
        self.openPosition = openPosition
        self.history = history
    }
    
    // Core persistence logic
    private func saveToDisk() {
        defaults.set(demoBalance, forKey: "savedDemoBalance")
        
        if let pos = openPosition, let encoded = try? JSONEncoder().encode(pos) {
            defaults.set(encoded, forKey: "savedOpenPosition")
        } else {
            defaults.removeObject(forKey: "savedOpenPosition")
        }
        
        if let encoded = try? JSONEncoder().encode(history) {
            defaults.set(encoded, forKey: "savedHistory")
        }
    }

    private func syncRemoteOpenPosition() {
        let position = openPosition
        Task { await SupabaseService.shared.syncOpenPosition(position) }
    }

    private func syncRemoteClosedTrade(_ trade: ClosedPaperTrade) {
        Task { await SupabaseService.shared.syncClosedTrade(trade) }
    }

    private func syncRemoteConfig() {
        let balance = demoBalance
        Task { await SupabaseService.shared.saveUserConfig(accountSize: balance) }
    }
}

enum PaperTradingError: LocalizedError {
    case positionAlreadyOpen
    case noOpenPosition
    case invalidPrice
    case invalidAmount
    case insufficientBalance
    case invalidPartialPercent

    var errorDescription: String? {
        switch self {
        case .positionAlreadyOpen:
            return "You already have an open demo trade."
        case .noOpenPosition:
            return "There is no open demo trade to sell."
        case .invalidPrice:
            return "The current price is not available yet."
        case .invalidAmount:
            return "Enter a valid investment amount."
        case .insufficientBalance:
            return "Your demo balance is not enough for that amount."
        case .invalidPartialPercent:
            return "Partial sell must be between 1% and 99%."
        }
    }
}
