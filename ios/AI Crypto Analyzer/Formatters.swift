import Foundation

enum AppFormatters {
    static let standardCurrency: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "$" // USDT
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter
    }()

    static func peso(_ value: Double, compact: Bool = false) -> String {
        // We ignore the `compact` flag now to ensure decimals are always shown
        return standardCurrency.string(from: NSNumber(value: value)) ?? "$0.00"
    }

    static func number(_ value: Double, digits: Int = 2) -> String {
        value.formatted(.number.precision(.fractionLength(digits)))
    }

    static func percent(_ value: Double, digits: Int = 2) -> String {
        "\(number(value, digits: digits))%"
    }
}

