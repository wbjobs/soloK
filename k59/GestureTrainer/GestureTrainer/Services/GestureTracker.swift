import Foundation
import Combine
import UIKit

final class GestureTracker: ObservableObject {
    @Published var isTracking = false
    @Published var currentPattern: [Int] = []
    @Published var trajectoryPoints: [TrajectoryPoint] = []
    @Published var speeds: [Double] = []
    @Published var accelerations: [Double] = []
    @Published var pausePoints: [PausePoint] = []
    @Published var currentSpeed: Double = 0

    private var startTimestamp: TimeInterval = 0
    private var lastPointTimestamp: TimeInterval = 0
    private var lastPointLocation: CGPoint = .zero
    private var lastSpeed: Double = 0
    private var pauseStartTimestamp: TimeInterval = 0
    private var isPaused = false
    private static let pauseThreshold: TimeInterval = 0.15
    private static let pointHitRadius: CGFloat = 40

    func startTracking() {
        isTracking = true
        currentPattern = []
        trajectoryPoints = []
        speeds = []
        accelerations = []
        pausePoints = []
        currentSpeed = 0
        lastSpeed = 0
        isPaused = false
        startTimestamp = CACurrentMediaTime()
        lastPointTimestamp = startTimestamp
    }

    func stopTracking() -> GestureRecording? {
        isTracking = false
        guard currentPattern.count >= GestureRecording.minimumPatternLength else { return nil }

        let duration = CACurrentMediaTime() - startTimestamp

        let recording = GestureRecording(
            pattern: currentPattern,
            trajectoryPoints: trajectoryPoints,
            duration: duration,
            isSuccessful: true,
            speeds: speeds,
            accelerations: accelerations,
            pausePoints: pausePoints
        )

        return recording
    }

    func handleTouch(at location: CGPoint, gridSize: CGSize) {
        guard isTracking else { return }

        let currentTimestamp = CACurrentMediaTime()
        let adjustedLocation = mapToGridCoordinate(location, gridSize: gridSize)

        let gridIndex = findNearestGridPoint(to: adjustedLocation)
        let trajectoryPoint = TrajectoryPoint(
            timestamp: currentTimestamp - startTimestamp,
            location: adjustedLocation,
            gridIndex: gridIndex
        )
        trajectoryPoints.append(trajectoryPoint)

        if let gridIndex = gridIndex, !currentPattern.contains(gridIndex) {
            currentPattern.append(gridIndex)
        }

        let timeDelta = currentTimestamp - lastPointTimestamp
        if timeDelta > 0 {
            let distance = sqrt(
                pow(adjustedLocation.x - lastPointLocation.x, 2) +
                pow(adjustedLocation.y - lastPointLocation.y, 2)
            )
            let speed = Double(distance) / timeDelta
            speeds.append(speed)
            currentSpeed = speed

            let acceleration = (speed - lastSpeed) / timeDelta
            accelerations.append(acceleration)
            lastSpeed = speed
        }

        if timeDelta > Self.pauseThreshold {
            if !isPaused {
                isPaused = true
                pauseStartTimestamp = lastPointTimestamp
            }
        } else if isPaused {
            isPaused = false
            let pauseDuration = lastPointTimestamp - pauseStartTimestamp
            if let lastGridIndex = currentPattern.last {
                let pause = PausePoint(
                    gridIndex: lastGridIndex,
                    duration: pauseDuration,
                    timestamp: pauseStartTimestamp - startTimestamp
                )
                pausePoints.append(pause)
            }
        }

        lastPointTimestamp = currentTimestamp
        lastPointLocation = adjustedLocation
    }

    private func mapToGridCoordinate(_ location: CGPoint, gridSize: CGSize) -> CGPoint {
        let scaleX = GridCoordinateSystem.gridWorldSize / gridSize.width
        let scaleY = GridCoordinateSystem.gridWorldSize / gridSize.height
        return CGPoint(x: location.x * scaleX, y: location.y * scaleY)
    }

    private func findNearestGridPoint(to location: CGPoint) -> Int? {
        var closestIndex: Int?
        var closestDistance: CGFloat = .greatestFiniteMagnitude

        for index in 0..<9 {
            let pointPosition = GridCoordinateSystem.position(for: index)
            let distance = sqrt(
                pow(location.x - pointPosition.x, 2) +
                pow(location.y - pointPosition.y, 2)
            )
            if distance < Self.pointHitRadius && distance < closestDistance {
                closestDistance = distance
                closestIndex = index
            }
        }

        return closestIndex
    }
}
