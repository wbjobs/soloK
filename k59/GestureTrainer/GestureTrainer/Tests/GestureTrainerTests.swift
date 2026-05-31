import XCTest
import CoreData
import CoreGraphics
@testable import GestureTrainer

final class GestureDataModelTests: XCTestCase {

    func testGridPointCount() {
        XCTAssertEqual(GridPoint.allPoints.count, 9)
    }

    func testGridPointPositions() {
        let first = GridPoint.allPoints[0]
        XCTAssertEqual(first.id, 0)
        XCTAssertEqual(first.position.x, 50)
        XCTAssertEqual(first.position.y, 50)

        let center = GridPoint.allPoints[4]
        XCTAssertEqual(center.id, 4)
        XCTAssertEqual(center.position.x, 150)
        XCTAssertEqual(center.position.y, 150)
    }

    func testGestureRecordingMinimumLength() {
        XCTAssertEqual(GestureRecording.minimumPatternLength, 4)
    }

    func testGestureRecordingCreation() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: 2.5,
            isSuccessful: true
        )
        XCTAssertEqual(recording.pattern, [0, 1, 2, 5])
        XCTAssertEqual(recording.duration, 2.5)
        XCTAssertTrue(recording.isSuccessful)
        XCTAssertEqual(recording.styleClassification, .unknown)
    }

    func testGestureStyleAllCases() {
        XCTAssertEqual(GestureStyle.allCases.count, 6)
    }

    func testPausePointCreation() {
        let pause = PausePoint(gridIndex: 4, duration: 0.3, timestamp: 1.5)
        XCTAssertEqual(pause.gridIndex, 4)
        XCTAssertEqual(pause.duration, 0.3)
        XCTAssertEqual(pause.timestamp, 1.5)
    }
}

final class GridCoordinateSystemTests: XCTestCase {

    func testGridPositionConsistency() {
        for index in 0..<9 {
            let gridPointPos = GridPoint.allPoints[index].position
            let coordSystemPos = GridCoordinateSystem.position(for: index)
            XCTAssertEqual(
                gridPointPos,
                coordSystemPos,
                "GridPoint position mismatch at index \(index)"
            )
        }
    }

    func testCellRectCentersMatchPointPositions() {
        let canvasSize = CGSize(width: 300, height: 300)

        for index in 0..<9 {
            let cellRect = GridCoordinateSystem.cellCenteredRect(for: index, in: canvasSize, padding: 3)
            let pointPos = GridCoordinateSystem.scaledPosition(for: index, in: canvasSize)

            XCTAssertTrue(
                cellRect.contains(pointPos),
                "Point \(index) position \(pointPos) should be inside its cell rect \(cellRect)"
            )

            XCTAssertEqual(
                cellRect.midX,
                pointPos.x,
                accuracy: 0.01,
                "Cell midX should match point x at index \(index)"
            )
            XCTAssertEqual(
                cellRect.midY,
                pointPos.y,
                accuracy: 0.01,
                "Cell midY should match point y at index \(index)"
            )
        }
    }

    func testScaledPositionConsistencyAcrossSizes() {
        let testSizes: [CGSize] = [
            CGSize(width: 300, height: 300),
            CGSize(width: 280, height: 280),
            CGSize(width: 200, height: 200),
            CGSize(width: 400, height: 400)
        ]

        for size in testSizes {
            let scale = GridCoordinateSystem.scale(for: size)

            for index in 0..<9 {
                let directScaled = GridCoordinateSystem.scaledPosition(for: index, in: size)
                let manualScaled = CGPoint(
                    x: GridCoordinateSystem.position(for: index).x * scale.x,
                    y: GridCoordinateSystem.position(for: index).y * scale.y
                )

                XCTAssertEqual(
                    directScaled.x,
                    manualScaled.x,
                    accuracy: 0.01,
                    "X position mismatch at size \(size) for index \(index)"
                )
                XCTAssertEqual(
                    directScaled.y,
                    manualScaled.y,
                    accuracy: 0.01,
                    "Y position mismatch at size \(size) for index \(index)"
                )
            }
        }
    }

    func testCellRectNoOverlap() {
        let canvasSize = CGSize(width: 300, height: 300)
        let padding: CGFloat = 3

        for i in 0..<9 {
            let rectI = GridCoordinateSystem.cellCenteredRect(for: i, in: canvasSize, padding: padding)
            for j in (i + 1)..<9 {
                let rectJ = GridCoordinateSystem.cellCenteredRect(for: j, in: canvasSize, padding: padding)
                XCTAssertFalse(
                    rectI.intersects(rectJ),
                    "Cells \(i) and \(j) should not overlap"
                )
            }
        }
    }

    func testCellRectsCoverGridArea() {
        let canvasSize = CGSize(width: 300, height: 300)
        let padding: CGFloat = 0

        var unionRect = CGRect.null
        for index in 0..<9 {
            let rect = GridCoordinateSystem.cellCenteredRect(for: index, in: canvasSize, padding: padding)
            unionRect = unionRect.union(rect)
        }

        XCTAssertEqual(unionRect.minX, 0, accuracy: 0.01)
        XCTAssertEqual(unionRect.minY, 0, accuracy: 0.01)
        XCTAssertEqual(unionRect.maxX, canvasSize.width, accuracy: 0.01)
        XCTAssertEqual(unionRect.maxY, canvasSize.height, accuracy: 0.01)
    }

    func testHeatmapAndNineGridCoordinateAlignment() {
        let canvasSize = CGSize(width: 280, height: 280)

        for index in 0..<9 {
            let nineGridPoint = GridCoordinateSystem.scaledPosition(for: index, in: canvasSize)
            let heatmapCellCenter = GridCoordinateSystem.cellCenteredRect(
                for: index,
                in: canvasSize,
                padding: 3
            ).midPoint

            XCTAssertEqual(
                nineGridPoint.x,
                heatmapCellCenter.x,
                accuracy: 0.01,
                "X coordinate mismatch at index \(index)"
            )
            XCTAssertEqual(
                nineGridPoint.y,
                heatmapCellCenter.y,
                accuracy: 0.01,
                "Y coordinate mismatch at index \(index)"
            )
        }
    }
}

final class DoubleExtensionTests: XCTestCase {

    func testIsFiniteOrZero() {
        XCTAssertEqual(Double.nan.isFiniteOrZero, 0)
        XCTAssertEqual(Double.infinity.isFiniteOrZero, 0)
        XCTAssertEqual((-Double.infinity).isFiniteOrZero, 0)
        XCTAssertEqual(42.0.isFiniteOrZero, 42.0)
        XCTAssertEqual(0.0.isFiniteOrZero, 0.0)
        XCTAssertEqual((-10.5).isFiniteOrZero, -10.5)
    }

    func testClamped() {
        XCTAssertEqual(150.0.clamped(to: 0...100), 100)
        XCTAssertEqual((-5.0).clamped(to: 0...100), 0)
        XCTAssertEqual(50.0.clamped(to: 0...100), 50)
        XCTAssertEqual(Double.nan.clamped(to: 0...100), 0)
        XCTAssertEqual(Double.infinity.clamped(to: 0...100), 100)
        XCTAssertEqual((-Double.infinity).clamped(to: -50...50), -50)
    }
}

final class StyleClassifierRobustnessTests: XCTestCase {

    func testFeatureProviderWithEmptyArrays() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: 2.0,
            isSuccessful: true,
            speeds: [],
            accelerations: [],
            pausePoints: []
        )

        XCTAssertNoThrow(try GestureFeatureProvider(recording: recording))
    }

    func testFeatureProviderWithNaNValues() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: .nan,
            isSuccessful: true,
            speeds: [.nan, 100, .nan],
            accelerations: [.nan, .infinity, 500],
            pausePoints: []
        )

        XCTAssertNoThrow(try GestureFeatureProvider(recording: recording))

        do {
            let provider = try GestureFeatureProvider(recording: recording)
            XCTAssertTrue(provider.avgSpeed.isFinite)
            XCTAssertTrue(provider.speedStd.isFinite)
            XCTAssertTrue(provider.avgAccel.isFinite)
            XCTAssertTrue(provider.accelStd.isFinite)
            XCTAssertTrue(provider.duration.isFinite)
        } catch {
            XCTFail("Should not throw: \(error)")
        }
    }

    func testFeatureProviderWithExtremeValues() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5, 8, 7, 6, 3, 0],
            trajectoryPoints: [],
            duration: 100,
            isSuccessful: true,
            speeds: [10000, -5000, 20000],
            accelerations: [100000, -100000, 50000],
            pausePoints: [
                PausePoint(gridIndex: 1, duration: 100, timestamp: 1.0)
            ]
        )

        do {
            let provider = try GestureFeatureProvider(recording: recording)
            XCTAssertLessThanOrEqual(provider.avgSpeed, 1000)
            XCTAssertGreaterThanOrEqual(provider.avgSpeed, 0)
            XCTAssertLessThanOrEqual(provider.avgAccel, 5000)
            XCTAssertGreaterThanOrEqual(provider.avgAccel, -5000)
            XCTAssertLessThanOrEqual(provider.pauseCount, 20)
            XCTAssertLessThanOrEqual(provider.totalPauseDuration, 10)
            XCTAssertLessThanOrEqual(provider.duration, 30)
        } catch {
            XCTFail("Should not throw: \(error)")
        }
    }

    func testFeatureProviderValuesAllFinite() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: 2.5,
            isSuccessful: true,
            speeds: [100, 150, 120, 180],
            accelerations: [50, -30, 40],
            pausePoints: [
                PausePoint(gridIndex: 1, duration: 0.3, timestamp: 1.0)
            ]
        )

        do {
            let provider = try GestureFeatureProvider(recording: recording)
            for (_, value) in provider.featureDict {
                if let doubleValue = value.doubleValue {
                    XCTAssertTrue(doubleValue.isFinite, "All feature values should be finite")
                    XCTAssertFalse(doubleValue.isNaN, "No feature should be NaN")
                }
            }
        } catch {
            XCTFail("Should not throw: \(error)")
        }
    }

    func testClassifyWithExtremeValuesDoesNotCrash() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: .infinity,
            isSuccessful: true,
            speeds: [.nan, .infinity, -1000000],
            accelerations: [.nan, .infinity, -1000000],
            pausePoints: []
        )

        let classifier = StyleClassifier()
        XCTAssertNoThrow(classifier.classify(recording: recording))

        let result = classifier.classify(recording: recording)
        XCTAssertNotEqual(result, .unknown)
    }

    func testClassifyWithSingleElementArrays() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: 1.0,
            isSuccessful: true,
            speeds: [100],
            accelerations: [50],
            pausePoints: []
        )

        let classifier = StyleClassifier()
        XCTAssertNoThrow(classifier.classify(recording: recording))

        let result = classifier.classify(recording: recording)
        XCTAssertNotEqual(result, .unknown)
    }
}

final class StyleClassifierTests: XCTestCase {

    func testClassifyConfidentGesture() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5, 8, 7, 6, 3],
            trajectoryPoints: [],
            duration: 1.5,
            isSuccessful: true,
            speeds: [250, 260, 240, 255, 250, 245, 260],
            accelerations: [10, -5, 15, -10, 5, 10],
            pausePoints: []
        )
        let classifier = StyleClassifier()
        let style = classifier.classify(recording: recording)
        XCTAssertNotEqual(style, .unknown)
    }

    func testClassifyNervousGesture() {
        let recording = GestureRecording(
            pattern: [0, 1, 2, 5],
            trajectoryPoints: [],
            duration: 5.0,
            isSuccessful: true,
            speeds: [30, 80, 20, 150, 10, 200, 5],
            accelerations: [500, -300, 800, -600, 900],
            pausePoints: [
                PausePoint(gridIndex: 1, duration: 0.8, timestamp: 1.0),
                PausePoint(gridIndex: 2, duration: 1.2, timestamp: 2.5),
                PausePoint(gridIndex: 5, duration: 0.5, timestamp: 4.0)
            ]
        )
        let classifier = StyleClassifier()
        let style = classifier.classify(recording: recording)
        XCTAssertNotEqual(style, .unknown)
    }

    func testClassifyShortPattern() {
        let recording = GestureRecording(
            pattern: [0, 4, 8],
            trajectoryPoints: [],
            duration: 1.0,
            isSuccessful: false,
            speeds: [100, 100],
            accelerations: [0, 0],
            pausePoints: []
        )
        let classifier = StyleClassifier()
        let style = classifier.classify(recording: recording)
        XCTAssertNotEqual(style, .unknown)
    }
}

final class GestureTrackerTests: XCTestCase {

    func testStartTracking() {
        let tracker = GestureTracker()
        XCTAssertFalse(tracker.isTracking)

        tracker.startTracking()
        XCTAssertTrue(tracker.isTracking)
        XCTAssertTrue(tracker.currentPattern.isEmpty)
        XCTAssertTrue(tracker.trajectoryPoints.isEmpty)
    }

    func testStopTrackingWithInsufficientPoints() {
        let tracker = GestureTracker()
        tracker.startTracking()
        let result = tracker.stopTracking()
        XCTAssertNil(result)
    }

    func testHandleTouchUpdatesTrajectory() {
        let tracker = GestureTracker()
        tracker.startTracking()

        let gridSize = CGSize(width: 300, height: 300)
        tracker.handleTouch(at: CGPoint(x: 50, y: 50), gridSize: gridSize)
        tracker.handleTouch(at: CGPoint(x: 150, y: 50), gridSize: gridSize)
        tracker.handleTouch(at: CGPoint(x: 250, y: 50), gridSize: gridSize)

        XCTAssertEqual(tracker.trajectoryPoints.count, 3)
        XCTAssertEqual(tracker.currentPattern.count, 3)
    }
}

final class PersistenceControllerTests: XCTestCase {

    var controller: PersistenceController!

    override func setUp() {
        super.setUp()
        controller = PersistenceController(inMemory: true)
    }

    override func tearDown() {
        controller = nil
        super.tearDown()
    }

    func testInMemoryStore() {
        XCTAssertNotNil(controller.container)
        XCTAssertEqual(controller.container.persistentStoreDescriptions.count, 1)
    }

    func testSaveAndFetchGestureRecord() {
        let context = controller.container.viewContext
        let record = GestureRecord(context: context)
        record.id = UUID()
        record.createdAt = Date()
        record.duration = 2.5
        record.isSuccessful = true
        record.styleRawValue = "自信"
        record.pattern = [0, 1, 2, 5]

        do {
            try context.save()
        } catch {
            XCTFail("Failed to save: \(error)")
        }

        let request: NSFetchRequest<GestureRecord> = GestureRecord.fetchRequest()
        do {
            let results = try context.fetch(request)
            XCTAssertEqual(results.count, 1)
            XCTAssertEqual(results.first?.styleRawValue, "自信")
            XCTAssertEqual(results.first?.pattern, [0, 1, 2, 5])
        } catch {
            XCTFail("Failed to fetch: \(error)")
        }
    }
}

extension CGRect {
    var midPoint: CGPoint {
        CGPoint(x: midX, y: midY)
    }
}
