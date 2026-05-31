import Foundation
import MultipeerConnectivity
import Combine

enum MatchState: Equatable {
    case idle
    case advertising
    case browsing
    case inviting(peerID: MCPeerID)
    case waitingForInviteResponse(peerID: MCPeerID)
    case connected(peerID: MCPeerID)
    case readyToStart(opponentName: String)
    case countdown(remaining: Int, targetPattern: [Int])
    case drawing(startTime: Date, targetPattern: [Int])
    case playerFinished
    case opponentFinished
    case matchResult(result: MatchResult)
    case disconnected(reason: String)
}

struct MatchResult: Equatable, Codable {
    let winner: String
    let winnerIsLocal: Bool
    let localDuration: TimeInterval
    let opponentDuration: TimeInterval
    let localPattern: [Int]
    let opponentPattern: [Int]
    let targetPattern: [Int]
    let localCorrect: Bool
    let opponentCorrect: Bool
    let matchDate: Date
}

enum GameMessageType: String, Codable {
    case readyForMatch
    case targetPattern
    case startDrawing
    case drawingProgress
    case finished
    case resultRequest
    case chat
}

struct GameMessage: Codable {
    let type: GameMessageType
    let payload: Data?

    init<T: Codable>(type: GameMessageType, data: T? = nil) {
        self.type = type
        if let data = data {
            self.payload = try? JSONEncoder().encode(data)
        } else {
            self.payload = nil
        }
    }

    func decodePayload<T: Codable>(as type: T.Type) -> T? {
        guard let payload = payload else { return nil }
        return try? JSONDecoder().decode(T.self, from: payload)
    }
}

struct DrawingProgress: Codable {
    let pattern: [Int]
    let currentSpeed: Double
}

struct FinishedDrawing: Codable {
    let pattern: [Int]
    let duration: TimeInterval
    let isCorrect: Bool
}

final class MultiplayerMatchService: NSObject, ObservableObject {
    static let shared = MultiplayerMatchService()

    @Published var matchState: MatchState = .idle
    @Published var connectedPeers: [MCPeerID] = []
    @Published var discoveredPeers: [MCPeerID] = []
    @Published var localPlayerName: String
    @Published var recentMatches: [MatchResult] = []

    private let myPeerID: MCPeerID
    private let serviceType = "gesture-match"

    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var session: MCSession?

    private var isHost = false
    private var targetPattern: [Int] = []
    private var localFinished: FinishedDrawing?
    private var opponentFinished: FinishedDrawing?

    private override init() {
        let deviceName = UIDevice.current.name
        self.localPlayerName = deviceName
        self.myPeerID = MCPeerID(displayName: deviceName)
        super.init()
    }

    func startAdvertising() {
        stopAll()
        matchState = .advertising

        advertiser = MCNearbyServiceAdvertiser(
            peer: myPeerID,
            discoveryInfo: ["playerName": localPlayerName],
            serviceType: serviceType
        )
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()
    }

    func startBrowsing() {
        stopAll()
        matchState = .browsing

        browser = MCNearbyServiceBrowser(peer: myPeerID, serviceType: serviceType)
        browser?.delegate = self
        browser?.startBrowsingForPeers()
    }

    func invitePeer(_ peerID: MCPeerID) {
        guard let browser = browser else { return }
        matchState = .waitingForInviteResponse(peerID: peerID)
        isHost = true

        session = MCSession(peer: myPeerID, securityIdentity: nil, encryptionPreference: .required)
        session?.delegate = self

        browser.invitePeer(peerID, to: session!, withContext: nil, timeout: 30)
    }

    func acceptInvite(from peerID: MCPeerID) {
        isHost = false
        session = MCSession(peer: myPeerID, securityIdentity: nil, encryptionPreference: .required)
        session?.delegate = self
    }

    func declineInvite(from peerID: MCPeerID) {
        matchState = .advertising
    }

    func disconnect() {
        stopAll()
        matchState = .disconnected(reason: "用户断开连接")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.matchState = .idle
        }
    }

    private func stopAll() {
        advertiser?.stopAdvertisingPeer()
        advertiser = nil

        browser?.stopBrowsingForPeers()
        browser = nil

        session?.disconnect()
        session = nil

        connectedPeers.removeAll()
        discoveredPeers.removeAll()
        localFinished = nil
        opponentFinished = nil
    }

    func sendReadyMessage() {
        let message = GameMessage(type: .readyForMatch)
        send(message: message)
    }

    func startMatch() {
        targetPattern = generateRandomPattern()
        isHost = true

        let message = GameMessage(type: .targetPattern, data: targetPattern)
        send(message: message)

        startCountdown(pattern: targetPattern)
    }

    func startCountdown(pattern: [Int]) {
        targetPattern = pattern

        for i in (1...3).reversed() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(3 - i)) { [weak self] in
                self?.matchState = .countdown(remaining: i, targetPattern: pattern)
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self = self else { return }
            self.matchState = .drawing(startTime: Date(), targetPattern: pattern)
            self.localFinished = nil
            self.opponentFinished = nil
        }
    }

    func updateDrawingProgress(pattern: [Int], speed: Double) {
        guard case .drawing = matchState else { return }

        let progress = DrawingProgress(pattern: pattern, currentSpeed: speed)
        let message = GameMessage(type: .drawingProgress, data: progress)
        send(message: message)
    }

    func finishDrawing(pattern: [Int], duration: TimeInterval) {
        guard case .drawing = matchState else { return }

        let isCorrect = pattern == targetPattern
        let finished = FinishedDrawing(pattern: pattern, duration: duration, isCorrect: isCorrect)
        localFinished = finished

        let message = GameMessage(type: .finished, data: finished)
        send(message: message)

        if let opponentFinished = opponentFinished {
            determineWinner(local: finished, opponent: opponentFinished)
        } else {
            matchState = .playerFinished
        }
    }

    private func determineWinner(local: FinishedDrawing, opponent: FinishedDrawing) {
        var winner: String
        var winnerIsLocal: Bool

        if local.isCorrect && !opponent.isCorrect {
            winner = localPlayerName
            winnerIsLocal = true
        } else if !local.isCorrect && opponent.isCorrect {
            winner = connectedPeers.first?.displayName ?? "对手"
            winnerIsLocal = false
        } else if local.isCorrect && opponent.isCorrect {
            if local.duration < opponent.duration {
                winner = localPlayerName
                winnerIsLocal = true
            } else {
                winner = connectedPeers.first?.displayName ?? "对手"
                winnerIsLocal = false
            }
        } else {
            winner = "平局（均未完成）"
            winnerIsLocal = false
        }

        let result = MatchResult(
            winner: winner,
            winnerIsLocal: winnerIsLocal,
            localDuration: local.duration,
            opponentDuration: opponent.duration,
            localPattern: local.pattern,
            opponentPattern: opponent.pattern,
            targetPattern: targetPattern,
            localCorrect: local.isCorrect,
            opponentCorrect: opponent.isCorrect,
            matchDate: Date()
        )

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.matchState = .matchResult(result: result)
            self.recentMatches.insert(result, at: 0)
            if self.recentMatches.count > 50 {
                self.recentMatches.removeLast()
            }
            self.saveMatchResultToCoreData(result)
        }
    }

    private func saveMatchResultToCoreData(_ result: MatchResult) {
        let context = PersistenceController.shared.container.viewContext
        context.perform {
            let record = MatchRecord(context: context)
            record.id = UUID()
            record.createdAt = result.matchDate
            record.winnerName = result.winner
            record.winnerIsLocal = result.winnerIsLocal
            record.opponentName = result.winnerIsLocal ? result.winner : (result.winner == "平局（均未完成）" ? "对手" : result.winner)
            record.localDuration = result.localDuration
            record.opponentDuration = result.opponentDuration
            record.targetPattern = result.targetPattern
            record.localPattern = result.localPattern
            record.opponentPattern = result.opponentPattern
            record.localCorrect = result.localCorrect
            record.opponentCorrect = result.opponentCorrect

            do {
                try context.save()
            } catch {
                print("Failed to save match result: \(error)")
            }
        }
    }

    private func generateRandomPattern() -> [Int] {
        var pattern: [Int] = []
        var available = Set(0..<9)

        let length = Int.random(in: 4...7)

        var current: Int?
        while pattern.count < length && !available.isEmpty {
            if let current = current {
                let adjacent = available.filter { isAdjacent($0, current) }
                if adjacent.isEmpty { break }
                current = adjacent.randomElement()
            } else {
                current = available.randomElement()
            }

            if let current = current {
                pattern.append(current)
                available.remove(current)
            }
        }

        return pattern
    }

    private func isAdjacent(_ a: Int, _ b: Int) -> Bool {
        let rowA = a / 3, colA = a % 3
        let rowB = b / 3, colB = b % 3
        return abs(rowA - rowB) <= 1 && abs(colA - colB) <= 1 && (rowA != rowB || colA != colB)
    }

    private func send(message: GameMessage) {
        guard let session = session, !session.connectedPeers.isEmpty else { return }

        do {
            let data = try JSONEncoder().encode(message)
            try session.send(data, toPeers: session.connectedPeers, with: .reliable)
        } catch {
            print("Failed to send message: \(error)")
        }
    }

    private func handleReceivedMessage(_ message: GameMessage, from peerID: MCPeerID) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            switch message.type {
            case .readyForMatch:
                if case .connected = self.matchState {
                    self.matchState = .readyToStart(opponentName: peerID.displayName)
                }

            case .targetPattern:
                if let pattern = message.decodePayload(as: [Int].self) {
                    self.targetPattern = pattern
                    self.isHost = false
                    self.startCountdown(pattern: pattern)
                }

            case .drawingProgress:
                break

            case .finished:
                if let finished = message.decodePayload(as: FinishedDrawing.self) {
                    self.opponentFinished = finished

                    if let localFinished = self.localFinished {
                        self.determineWinner(local: localFinished, opponent: finished)
                    } else if case .drawing = self.matchState {
                        self.matchState = .opponentFinished
                    }
                }

            default:
                break
            }
        }
    }
}

extension MultiplayerMatchService: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.matchState = .inviting(peerID: peerID)

            self.acceptInvite(from: peerID)
            invitationHandler(true, self.session)
        }
    }
}

extension MultiplayerMatchService: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if !self.discoveredPeers.contains(peerID) {
                self.discoveredPeers.append(peerID)
            }
        }
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async { [weak self] in
            self?.discoveredPeers.removeAll { $0 == peerID }
        }
    }
}

extension MultiplayerMatchService: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            switch state {
            case .connected:
                if !self.connectedPeers.contains(peerID) {
                    self.connectedPeers.append(peerID)
                }
                self.matchState = .connected(peerID: peerID)
                self.sendReadyMessage()

            case .notConnected:
                self.connectedPeers.removeAll { $0 == peerID }
                if self.connectedPeers.isEmpty {
                    self.matchState = .disconnected(reason: "连接断开")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                        self?.matchState = .idle
                    }
                }

            case .connecting:
                break

            @unknown default:
                break
            }
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        do {
            let message = try JSONDecoder().decode(GameMessage.self, from: data)
            handleReceivedMessage(message, from: peerID)
        } catch {
            print("Failed to decode message: \(error)")
        }
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}

    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}

    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
