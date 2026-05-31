import Foundation
import CoreGraphics

struct GridPoint: Identifiable, Codable, Equatable {
    let id: Int
    let position: CGPoint

    static let allPoints: [GridPoint] = {
        (0..<9).map { index in
            GridPoint(
                id: index,
                position: GridCoordinateSystem.position(for: index)
            )
        }
    }()
}

struct TrajectoryPoint: Identifiable, Codable {
    let id: UUID
    let timestamp: TimeInterval
    let location: CGPoint
    let gridIndex: Int?

    init(timestamp: TimeInterval, location: CGPoint, gridIndex: Int? = nil) {
        self.id = UUID()
        self.timestamp = timestamp
        self.location = location
        self.gridIndex = gridIndex
    }
}

struct GestureRecording: Identifiable, Codable {
    let id: UUID
    let createdAt: Date
    var pattern: [Int]
    var trajectoryPoints: [TrajectoryPoint]
    var duration: TimeInterval
    var isSuccessful: Bool
    var styleClassification: GestureStyle
    var speeds: [Double]
    var accelerations: [Double]
    var pausePoints: [PausePoint]

    init(
        pattern: [Int],
        trajectoryPoints: [TrajectoryPoint],
        duration: TimeInterval,
        isSuccessful: Bool,
        styleClassification: GestureStyle = .unknown,
        speeds: [Double] = [],
        accelerations: [Double] = [],
        pausePoints: [PausePoint] = []
    ) {
        self.id = UUID()
        self.createdAt = Date()
        self.pattern = pattern
        self.trajectoryPoints = trajectoryPoints
        self.duration = duration
        self.isSuccessful = isSuccessful
        self.styleClassification = styleClassification
        self.speeds = speeds
        self.accelerations = accelerations
        self.pausePoints = pausePoints
    }

    static let minimumPatternLength = 4
}

struct PausePoint: Identifiable, Codable {
    let id: UUID
    let gridIndex: Int
    let duration: TimeInterval
    let timestamp: TimeInterval

    init(gridIndex: Int, duration: TimeInterval, timestamp: TimeInterval) {
        self.id = UUID()
        self.gridIndex = gridIndex
        self.duration = duration
        self.timestamp = timestamp
    }
}

enum GestureStyle: String, Codable, CaseIterable, Identifiable {
    case original = "原创"
    case imitation = "模仿"
    case nervous = "紧张"
    case confident = "自信"
    case hesitant = "犹豫"
    case unknown = "未知"

    var id: String { rawValue }

    var colorHex: String {
        switch self {
        case .original: return "#4CAF50"
        case .imitation: return "#2196F3"
        case .nervous: return "#F44336"
        case .confident: return "#FF9800"
        case .hesitant: return "#9C27B0"
        case .unknown: return "#9E9E9E"
        }
    }

    var systemImage: String {
        switch self {
        case .original: return "sparkles"
        case .imitation: return "copy"
        case .nervous: return "fluctuation"
        case .confident: return "bolt.fill"
        case .hesitant: return "pause.circle"
        case .unknown: return "questionmark"
        }
    }
}
