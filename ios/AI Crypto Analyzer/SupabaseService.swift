import Combine
import Foundation

struct SupabaseUser: Codable, Equatable {
    let id: String
    let email: String?
}

struct SupabaseSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
    let user: SupabaseUser
}

struct SupabaseUserConfig: Codable, Equatable {
    let riskPercent: Double
    let accountSize: Double
    let defaultMode: String
    let favoritePairs: [String]
}

@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    @Published private(set) var session: SupabaseSession?
    @Published private(set) var authMessage: String?
    @Published private(set) var isWorking = false

    private let defaults = UserDefaults.standard
    private let sessionKey = "supabaseSession"

    private static let defaultURL = "https://ccoimnobpcwrdrfxwpye.supabase.co"
    private static let defaultAnonKey = "sb_publishable_-awqZZ7YcY5IjY1MxI32Zw_qom4pibW"

    private var supabaseURL: URL {
        URL(string: ProcessInfo.processInfo.environment["SUPABASE_URL"] ?? Self.defaultURL)!
    }

    private var anonKey: String {
        ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? Self.defaultAnonKey
    }

    var isSignedIn: Bool { session != nil }
    var userEmail: String { session?.user.email ?? "Signed in" }

    private init() {
        loadSession()
    }

    func signUp(email: String, password: String) async {
        await authenticate(path: "/auth/v1/signup", email: email, password: password, allowEmailConfirmation: true)
    }

    func signIn(email: String, password: String) async {
        await authenticate(path: "/auth/v1/token", queryItems: [URLQueryItem(name: "grant_type", value: "password")], email: email, password: password, allowEmailConfirmation: false)
    }

    func signOut() {
        session = nil
        defaults.removeObject(forKey: sessionKey)
        authMessage = "Signed out."
    }

    func loadUserConfig() async throws -> SupabaseUserConfig? {
        guard let session else { return nil }
        var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/user_configs"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "user_id", value: "eq.\(session.user.id)"),
            URLQueryItem(name: "limit", value: "1")
        ]

        let rows: [UserConfigRow] = try await send(components.url!, method: "GET", authorized: true)
        guard let row = rows.first else { return nil }
        return SupabaseUserConfig(
            riskPercent: row.riskPercent ?? 1,
            accountSize: row.accountSize ?? 100_000,
            defaultMode: row.defaultMode ?? "normal",
            favoritePairs: row.favoritePairs ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
        )
    }

    func saveUserConfig(accountSize: Double? = nil, riskPercent: Double? = nil, defaultMode: String? = nil, favoritePairs: [String]? = nil) async {
        guard let session else { return }
        var payload = UserConfigUpsert(userId: session.user.id)
        payload.accountSize = accountSize
        payload.riskPercent = riskPercent
        payload.defaultMode = defaultMode
        payload.favoritePairs = favoritePairs
        payload.updatedAt = isoString(Date())

        do {
            var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/user_configs"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "on_conflict", value: "user_id")]
            try await sendNoContent(
                components.url!,
                method: "POST",
                body: payload,
                authorized: true,
                prefer: "resolution=merge-duplicates,return=minimal"
            )
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func loadPaperTrades() async throws -> (openPosition: PaperPosition?, history: [ClosedPaperTrade], demoBalance: Double)? {
        guard let session else { return nil }
        let config = try await loadUserConfig()

        let openRows: [PaperTradeRow] = try await queryTrades(userId: session.user.id, status: "open")
        let closedRows: [PaperTradeRow] = try await queryTrades(userId: session.user.id, status: "closed")

        let open = openRows.first.flatMap(makeOpenPosition)
        let history = closedRows.compactMap(makeClosedTrade)

        return (
            openPosition: open,
            history: history,
            demoBalance: config?.accountSize ?? 100_000
        )
    }

    func syncOpenPosition(_ position: PaperPosition?) async {
        guard let session else { return }
        do {
            if let position {
                let row = PaperTradeUpsert(
                    id: position.id.uuidString,
                    userId: session.user.id,
                    symbol: position.symbol,
                    side: "BUY",
                    entryPrice: position.entryPrice,
                    exitPrice: nil,
                    quantity: position.quantity,
                    pnl: nil,
                    status: "open",
                    mode: "normal",
                    notes: encodeNotes([
                        "investedAmount": position.investedAmount,
                        "buyFee": position.buyFee,
                        "remainingQuantity": position.remainingQuantity,
                        "entryDate": isoString(position.entryDate)
                    ]),
                    createdAt: isoString(position.entryDate),
                    closedAt: nil
                )
                try await upsertTrade(row)
            } else {
                try await deleteOpenTrades(userId: session.user.id)
            }
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func syncClosedTrade(_ trade: ClosedPaperTrade) async {
        guard let session else { return }
        do {
            let row = PaperTradeUpsert(
                id: trade.id.uuidString,
                userId: session.user.id,
                symbol: trade.symbol,
                side: "BUY",
                entryPrice: trade.entryPrice,
                exitPrice: trade.exitPrice,
                quantity: trade.quantity,
                pnl: trade.profit,
                status: "closed",
                mode: "normal",
                notes: encodeNotes([
                    "investedAmount": trade.investedAmount,
                    "buyFee": trade.buyFee,
                    "sellFee": trade.sellFee,
                    "entryDate": isoString(trade.entryDate),
                    "exitDate": isoString(trade.exitDate)
                ]),
                createdAt: isoString(trade.entryDate),
                closedAt: isoString(trade.exitDate)
            )
            try await upsertTrade(row)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func deleteClosedTrade(id: UUID) async {
        guard let session else { return }
        do {
            var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/paper_trades"), resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "id", value: "eq.\(id.uuidString)"),
                URLQueryItem(name: "user_id", value: "eq.\(session.user.id)")
            ]
            try await sendNoContent(components.url!, method: "DELETE", authorized: true)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    func clearPaperTrades() async {
        guard let session else { return }
        do {
            var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/paper_trades"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "user_id", value: "eq.\(session.user.id)")]
            try await sendNoContent(components.url!, method: "DELETE", authorized: true)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    private func authenticate(path: String, queryItems: [URLQueryItem] = [], email: String, password: String, allowEmailConfirmation: Bool) async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            authMessage = "Enter email and password."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let payload = AuthPayload(email: trimmedEmail, password: password)
            var components = URLComponents(url: supabaseURL.appending(path: path), resolvingAgainstBaseURL: false)!
            if !queryItems.isEmpty {
                components.queryItems = queryItems
            }
            guard let url = components.url else {
                authMessage = "Invalid auth URL."
                return
            }
            let response: AuthResponse = try await send(url, method: "POST", body: payload, authorized: false)
            guard let accessToken = response.accessToken else {
                authMessage = allowEmailConfirmation ? "Check your email for a confirmation link." : "Sign in did not return a session."
                return
            }
            let newSession = SupabaseSession(
                accessToken: accessToken,
                refreshToken: response.refreshToken,
                expiresAt: response.expiresIn.map { Date().addingTimeInterval(TimeInterval($0)) },
                user: response.user
            )
            session = newSession
            saveSession(newSession)
            authMessage = "Supabase connected."
        } catch {
            authMessage = error.localizedDescription
        }
    }

    private func queryTrades(userId: String, status: String) async throws -> [PaperTradeRow] {
        var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/paper_trades"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "status", value: "eq.\(status)"),
            URLQueryItem(name: "order", value: "created_at.desc")
        ]
        return try await send(components.url!, method: "GET", authorized: true)
    }

    private func upsertTrade(_ row: PaperTradeUpsert) async throws {
        var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/paper_trades"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "on_conflict", value: "id")]
        try await sendNoContent(
            components.url!,
            method: "POST",
            body: row,
            authorized: true,
            prefer: "resolution=merge-duplicates,return=minimal"
        )
    }

    private func deleteOpenTrades(userId: String) async throws {
        var components = URLComponents(url: supabaseURL.appending(path: "/rest/v1/paper_trades"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "status", value: "eq.open")
        ]
        try await sendNoContent(components.url!, method: "DELETE", authorized: true)
    }

    private func makeOpenPosition(row: PaperTradeRow) -> PaperPosition? {
        guard let id = UUID(uuidString: row.id) else { return nil }
        let notes = decodeNotes(row.notes)
        let entryDate = notes.date("entryDate") ?? parseDate(row.createdAt) ?? Date()
        let quantity = row.quantity ?? 0
        return PaperPosition(
            id: id,
            symbol: row.symbol,
            entryDate: entryDate,
            entryPrice: row.entryPrice ?? 0,
            investedAmount: notes.double("investedAmount") ?? ((row.entryPrice ?? 0) * quantity),
            buyFee: notes.double("buyFee") ?? 0,
            quantity: quantity,
            remainingQuantity: notes.double("remainingQuantity") ?? quantity
        )
    }

    private func makeClosedTrade(row: PaperTradeRow) -> ClosedPaperTrade? {
        guard let id = UUID(uuidString: row.id) else { return nil }
        let notes = decodeNotes(row.notes)
        let entryDate = notes.date("entryDate") ?? parseDate(row.createdAt) ?? Date()
        let exitDate = notes.date("exitDate") ?? parseDate(row.closedAt) ?? Date()
        return ClosedPaperTrade(
            id: id,
            symbol: row.symbol,
            entryDate: entryDate,
            exitDate: exitDate,
            entryPrice: row.entryPrice ?? 0,
            exitPrice: row.exitPrice ?? row.entryPrice ?? 0,
            investedAmount: notes.double("investedAmount") ?? ((row.entryPrice ?? 0) * (row.quantity ?? 0)),
            buyFee: notes.double("buyFee") ?? 0,
            sellFee: notes.double("sellFee") ?? 0,
            quantity: row.quantity ?? 0,
            profit: row.pnl ?? 0
        )
    }

    private func send<T: Decodable>(_ url: URL, method: String, authorized: Bool) async throws -> T {
        try await send(url, method: method, body: Optional<String>.none, authorized: authorized)
    }

    private func send<T: Decodable, Body: Encodable>(_ url: URL, method: String, body: Body?, authorized: Bool) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authorized, let token = session?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder.supabase.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(data: data, response: response)
        return try JSONDecoder.supabase.decode(T.self, from: data)
    }

    private func sendNoContent<Body: Encodable>(_ url: URL, method: String, body: Body? = Optional<String>.none, authorized: Bool, prefer: String? = nil) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
        if authorized, let token = session?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder.supabase.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(data: data, response: response)
    }

    private func validate(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard 200..<300 ~= http.statusCode else {
            if let error = try? JSONDecoder().decode(SupabaseError.self, from: data) {
                throw SupabaseClientError.server(error.message ?? error.errorDescription ?? error.error ?? "Supabase request failed.")
            }
            let message = String(data: data, encoding: .utf8) ?? "Supabase request failed."
            throw SupabaseClientError.server(message)
        }
    }

    private func loadSession() {
        guard let data = defaults.data(forKey: sessionKey),
              let saved = try? JSONDecoder.supabase.decode(SupabaseSession.self, from: data) else { return }
        session = saved
    }

    private func saveSession(_ session: SupabaseSession) {
        if let data = try? JSONEncoder.supabase.encode(session) {
            defaults.set(data, forKey: sessionKey)
        }
    }

    private func encodeNotes(_ notes: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(notes),
              let data = try? JSONSerialization.data(withJSONObject: notes),
              let string = String(data: data, encoding: .utf8) else { return "{}" }
        return string
    }

    private func decodeNotes(_ notes: String?) -> [String: Any] {
        guard let notes, let data = notes.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object
    }

    private func isoString(_ date: Date) -> String {
        ISO8601DateFormatter.supabase.string(from: date)
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return ISO8601DateFormatter.supabase.date(from: value) ?? ISO8601DateFormatter.basic.date(from: value)
    }
}

private struct AuthPayload: Encodable {
    let email: String
    let password: String
}

private struct AuthResponse: Decodable {
    let accessToken: String?
    let refreshToken: String?
    let expiresIn: Int?
    let user: SupabaseUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }
}

private struct UserConfigRow: Decodable {
    let riskPercent: Double?
    let accountSize: Double?
    let defaultMode: String?
    let favoritePairs: [String]?

    enum CodingKeys: String, CodingKey {
        case riskPercent = "risk_percent"
        case accountSize = "account_size"
        case defaultMode = "default_mode"
        case favoritePairs = "favorite_pairs"
    }
}

private struct UserConfigUpsert: Encodable {
    let userId: String
    var riskPercent: Double?
    var accountSize: Double?
    var defaultMode: String?
    var favoritePairs: [String]?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case riskPercent = "risk_percent"
        case accountSize = "account_size"
        case defaultMode = "default_mode"
        case favoritePairs = "favorite_pairs"
        case updatedAt = "updated_at"
    }
}

private struct PaperTradeRow: Decodable {
    let id: String
    let symbol: String
    let entryPrice: Double?
    let exitPrice: Double?
    let quantity: Double?
    let pnl: Double?
    let notes: String?
    let createdAt: String?
    let closedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, symbol, quantity, pnl, notes
        case entryPrice = "entry_price"
        case exitPrice = "exit_price"
        case createdAt = "created_at"
        case closedAt = "closed_at"
    }
}

private struct PaperTradeUpsert: Encodable {
    let id: String
    let userId: String
    let symbol: String
    let side: String
    let entryPrice: Double
    let exitPrice: Double?
    let quantity: Double
    let pnl: Double?
    let status: String
    let mode: String
    let notes: String
    let createdAt: String
    let closedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, symbol, side, quantity, pnl, status, mode, notes
        case userId = "user_id"
        case entryPrice = "entry_price"
        case exitPrice = "exit_price"
        case createdAt = "created_at"
        case closedAt = "closed_at"
    }
}

private struct SupabaseError: Decodable {
    let message: String?
    let error: String?
    let errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case message, error
        case errorDescription = "error_description"
    }
}

private enum SupabaseClientError: LocalizedError {
    case server(String)

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        }
    }
}

private extension JSONEncoder {
    static var supabase: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var supabase: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension ISO8601DateFormatter {
    static let supabase: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

private extension Dictionary where Key == String, Value == Any {
    func double(_ key: String) -> Double? {
        if let value = self[key] as? Double { return value }
        if let value = self[key] as? Int { return Double(value) }
        if let value = self[key] as? String { return Double(value) }
        return nil
    }

    func date(_ key: String) -> Date? {
        guard let value = self[key] as? String else { return nil }
        return ISO8601DateFormatter.supabase.date(from: value) ?? ISO8601DateFormatter.basic.date(from: value)
    }
}
