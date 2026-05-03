import Foundation

enum IndicatorEngine {
    static func ema(values: [Double], period: Int) -> [Double?] {
        guard period > 0, values.count >= period else {
            return Array(repeating: nil, count: values.count)
        }

        var result = Array<Double?>(repeating: nil, count: values.count)
        let multiplier = 2.0 / Double(period + 1)
        let seed = values.prefix(period).reduce(0, +) / Double(period)
        result[period - 1] = seed

        var previousEMA = seed
        for index in period..<values.count {
            let currentEMA = (values[index] - previousEMA) * multiplier + previousEMA
            result[index] = currentEMA
            previousEMA = currentEMA
        }

        return result
    }

    static func rsi(values: [Double], period: Int = 14) -> [Double?] {
        guard values.count > period else {
            return Array(repeating: nil, count: values.count)
        }

        var result = Array<Double?>(repeating: nil, count: values.count)
        var gains = 0.0
        var losses = 0.0

        for index in 1...period {
            let change = values[index] - values[index - 1]
            if change >= 0 {
                gains += change
            } else {
                losses += abs(change)
            }
        }

        var averageGain = gains / Double(period)
        var averageLoss = losses / Double(period)
        result[period] = rsiValue(averageGain: averageGain, averageLoss: averageLoss)

        guard values.count > period + 1 else { return result }

        for index in (period + 1)..<values.count {
            let change = values[index] - values[index - 1]
            let gain = max(change, 0)
            let loss = max(-change, 0)
            averageGain = ((averageGain * Double(period - 1)) + gain) / Double(period)
            averageLoss = ((averageLoss * Double(period - 1)) + loss) / Double(period)
            result[index] = rsiValue(averageGain: averageGain, averageLoss: averageLoss)
        }

        return result
    }

    static func macd(values: [Double]) -> (macd: [Double?], signal: [Double?]) {
        let ema12 = ema(values: values, period: 12)
        let ema26 = ema(values: values, period: 26)
        var macdLine = Array<Double?>(repeating: nil, count: values.count)

        for index in values.indices {
            guard let fast = ema12[index], let slow = ema26[index] else { continue }
            macdLine[index] = fast - slow
        }

        let compactMACD = macdLine.compactMap { $0 }
        let compactSignal = ema(values: compactMACD, period: 9)
        var signalLine = Array<Double?>(repeating: nil, count: values.count)
        var compactIndex = 0

        for index in macdLine.indices where macdLine[index] != nil {
            if compactIndex < compactSignal.count {
                signalLine[index] = compactSignal[compactIndex]
            }
            compactIndex += 1
        }

        return (macdLine, signalLine)
    }

    static func snapshot(for candles: [Candle]) -> IndicatorSnapshot {
        let closes = candles.map(\.close)
        let volumes = candles.map(\.volume)
        guard let latest = candles.last else { return IndicatorSnapshot() }

        let ema9Values = ema(values: closes, period: 9)
        let ema21Values = ema(values: closes, period: 21)
        let ema50Values = ema(values: closes, period: 50)
        let rsiValues = rsi(values: closes)
        let macdValues = macd(values: closes)

        let averageVolume20: Double?
        if volumes.count >= 20 {
            averageVolume20 = volumes.suffix(20).reduce(0, +) / 20
        } else {
            averageVolume20 = nil
        }

        let recent = candles.suffix(20)
        let support = recent.map(\.low).min()
        let resistance = recent.map(\.high).max()

        return IndicatorSnapshot(
            ema9: ema9Values.last ?? nil,
            ema21: ema21Values.last ?? nil,
            ema50: ema50Values.last ?? nil,
            rsi14: rsiValues.last ?? nil,
            previousRSI14: previousValue(in: rsiValues),
            macd: macdValues.macd.last ?? nil,
            macdSignal: macdValues.signal.last ?? nil,
            previousMACD: previousValue(in: macdValues.macd),
            previousMACDSignal: previousValue(in: macdValues.signal),
            averageVolume20: averageVolume20,
            currentVolume: latest.volume,
            support: support,
            resistance: resistance
        )
    }

    private static func rsiValue(averageGain: Double, averageLoss: Double) -> Double {
        if averageLoss == 0 { return 100 }
        let relativeStrength = averageGain / averageLoss
        return 100 - (100 / (1 + relativeStrength))
    }

    private static func previousValue(in values: [Double?]) -> Double? {
        let compact = values.compactMap { $0 }
        guard compact.count >= 2 else { return nil }
        return compact[compact.count - 2]
    }
}

