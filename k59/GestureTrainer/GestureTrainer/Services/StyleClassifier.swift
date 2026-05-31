import Foundation
import CoreML

final class StyleClassifier {
    static let shared = StyleClassifier()

    private var model: MLModel?
    private let lock = NSLock()
    private let predictionQueue = DispatchQueue(label: "com.gesturetrainer.styleclassifier.prediction", qos: .userInitiated)

    private init() {
        loadModel()
    }

    private func loadModel() {
        guard let modelURL = Bundle.main.url(forResource: "GestureStyleClassifier", withExtension: "mlmodelc") else {
            print("Core ML model not found, using rule-based fallback")
            return
        }
        do {
            let config = MLModelConfiguration()
            config.computeUnits = .all
            config.allowLowPrecisionAccumulationOnGPU = true
            model = try MLModel(contentsOf: modelURL, configuration: config)
        } catch {
            print("Failed to load Core ML model: \(error)")
            model = nil
        }
    }

    func classify(recording: GestureRecording) -> GestureStyle {
        lock.lock()
        defer { lock.unlock() }

        if let model = model {
            do {
                let featureProvider = try GestureFeatureProvider(recording: recording)
                return classifyWithModel(featureProvider: featureProvider, model: model)
            } catch {
                print("Feature provider creation failed: \(error), using rules")
                return classifyWithRules(recording: recording)
            }
        }
        return classifyWithRules(recording: recording)
    }

    private func classifyWithModel(featureProvider: GestureFeatureProvider, model: MLModel) -> GestureStyle {
        var result: GestureStyle = .unknown
        var didFail = false

        predictionQueue.sync {
            do {
                let prediction = try model.prediction(from: featureProvider)

                guard let styleLabel = prediction.featureValue(for: "style")?.stringValue else {
                    print("Prediction missing 'style' feature")
                    didFail = true
                    return
                }

                guard let style = GestureStyle(rawValue: styleLabel) else {
                    print("Unknown style label: \(styleLabel)")
                    didFail = true
                    return
                }

                result = style
            } catch {
                print("Core ML prediction failed with error: \(error.localizedDescription)")
                didFail = true
            }
        }

        if didFail {
            return classifyWithRulesFromFeatures(featureProvider: featureProvider)
        }

        return result
    }

    private func classifyWithRulesFromFeatures(featureProvider: GestureFeatureProvider) -> GestureStyle {
        let avgSpeed = featureProvider.avgSpeed
        let speedStd = featureProvider.speedStd
        let avgAccel = featureProvider.avgAccel
        let accelStd = featureProvider.accelStd
        let pauseCount = featureProvider.pauseCount
        let patternLen = featureProvider.patternLen

        let speedVariance = pow(speedStd, 2)
        let accelerationVariance = pow(accelStd, 2)

        var scores: [GestureStyle: Double] = [:]

        scores[.confident] = computeConfidentScore(
            avgSpeed: avgSpeed,
            speedVariance: speedVariance,
            pauseCount: Int(pauseCount),
            patternLength: Int(patternLen)
        )

        scores[.nervous] = computeNervousScore(
            avgSpeed: avgSpeed,
            accelerationVariance: accelerationVariance,
            pauseCount: Int(pauseCount),
            speedVariance: speedVariance
        )

        scores[.hesitant] = computeHesitantScore(
            pauseCount: Int(pauseCount),
            avgSpeed: avgSpeed,
            patternLength: Int(patternLen)
        )

        scores[.original] = computeOriginalScore(
            patternLength: Int(patternLen),
            speedVariance: speedVariance,
            avgAcceleration: avgAccel
        )

        scores[.imitation] = computeImitationScore(
            avgSpeed: avgSpeed,
            speedVariance: speedVariance,
            pauseCount: Int(pauseCount)
        )

        if let bestStyle = scores.max(by: { $0.value < $1.value }), bestStyle.value > 0 {
            return bestStyle.key
        }

        return .unknown
    }

    private func classifyWithRules(recording: GestureRecording) -> GestureStyle {
        let avgSpeed = recording.speeds.isEmpty ? 0 : recording.speeds.reduce(0, +) / Double(recording.speeds.count)
        let speedVariance = computeVariance(recording.speeds)
        let avgAcceleration = recording.accelerations.isEmpty ? 0 : recording.accelerations.reduce(0, +) / Double(recording.accelerations.count)
        let accelerationVariance = computeVariance(recording.accelerations)
        let pauseCount = recording.pausePoints.count
        let patternLength = recording.pattern.count

        var scores: [GestureStyle: Double] = [:]

        scores[.confident] = computeConfidentScore(
            avgSpeed: avgSpeed,
            speedVariance: speedVariance,
            pauseCount: pauseCount,
            patternLength: patternLength
        )

        scores[.nervous] = computeNervousScore(
            avgSpeed: avgSpeed,
            accelerationVariance: accelerationVariance,
            pauseCount: pauseCount,
            speedVariance: speedVariance
        )

        scores[.hesitant] = computeHesitantScore(
            pauseCount: pauseCount,
            avgSpeed: avgSpeed,
            patternLength: patternLength
        )

        scores[.original] = computeOriginalScore(
            patternLength: patternLength,
            speedVariance: speedVariance,
            avgAcceleration: avgAcceleration
        )

        scores[.imitation] = computeImitationScore(
            avgSpeed: avgSpeed,
            speedVariance: speedVariance,
            pauseCount: pauseCount
        )

        if let bestStyle = scores.max(by: { $0.value < $1.value }), bestStyle.value > 0 {
            return bestStyle.key
        }

        return .unknown
    }

    private func computeVariance(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let mean = values.reduce(0, +) / Double(values.count)
        let sumOfSquares = values.reduce(0) { $0 + pow($1 - mean, 2) }
        let variance = sumOfSquares / Double(values.count - 1)
        return max(variance, 0).isFiniteOrZero
    }

    private func computeConfidentScore(avgSpeed: Double, speedVariance: Double, pauseCount: Int, patternLength: Int) -> Double {
        var score = 0.0
        if avgSpeed > 200 { score += 2.0 }
        else if avgSpeed > 100 { score += 1.0 }
        if speedVariance < 5000 { score += 2.0 }
        else if speedVariance < 15000 { score += 1.0 }
        if pauseCount == 0 { score += 2.0 }
        else if pauseCount <= 1 { score += 1.0 }
        if patternLength >= 7 { score += 1.0 }
        return score
    }

    private func computeNervousScore(avgSpeed: Double, accelerationVariance: Double, pauseCount: Int, speedVariance: Double) -> Double {
        var score = 0.0
        if avgSpeed < 80 { score += 1.5 }
        if accelerationVariance > 100000 { score += 2.0 }
        else if accelerationVariance > 50000 { score += 1.0 }
        if speedVariance > 20000 { score += 1.5 }
        if pauseCount >= 3 { score += 2.0 }
        else if pauseCount >= 2 { score += 1.0 }
        return score
    }

    private func computeHesitantScore(avgSpeed: Double, pauseCount: Int, patternLength: Int) -> Double {
        var score = 0.0
        if pauseCount >= 2 { score += 2.0 }
        else if pauseCount >= 1 { score += 1.0 }
        if avgSpeed < 100 { score += 1.5 }
        if patternLength <= 5 { score += 1.0 }
        return score
    }

    private func computeOriginalScore(patternLength: Int, speedVariance: Double, avgAcceleration: Double) -> Double {
        var score = 0.0
        if patternLength >= 8 { score += 2.0 }
        else if patternLength >= 6 { score += 1.0 }
        if speedVariance > 10000 && speedVariance < 50000 { score += 1.5 }
        if abs(avgAcceleration) > 500 { score += 1.0 }
        return score
    }

    private func computeImitationScore(avgSpeed: Double, speedVariance: Double, pauseCount: Int) -> Double {
        var score = 0.0
        if avgSpeed > 80 && avgSpeed < 200 { score += 1.5 }
        if speedVariance < 10000 { score += 1.5 }
        if pauseCount <= 1 { score += 1.0 }
        return score
    }
}

final class GestureFeatureProvider: MLFeatureProvider {
    let featureDict: [String: MLFeatureValue]
    let avgSpeed: Double
    let speedStd: Double
    let avgAccel: Double
    let accelStd: Double
    let pauseCount: Double
    let patternLen: Double
    let totalPauseDuration: Double
    let duration: Double

    init(recording: GestureRecording) throws {
        let rawAvgSpeed = recording.speeds.isEmpty ? 0.0 : recording.speeds.reduce(0, +) / Double(recording.speeds.count)
        avgSpeed = rawAvgSpeed.clamped(to: 0...1000)

        let rawSpeedStd = Self.standardDeviation(recording.speeds)
        speedStd = rawSpeedStd.clamped(to: 0...500)

        let rawAvgAccel = recording.accelerations.isEmpty ? 0.0 : recording.accelerations.reduce(0, +) / Double(recording.accelerations.count)
        avgAccel = rawAvgAccel.clamped(to: -5000...5000)

        let rawAccelStd = Self.standardDeviation(recording.accelerations)
        accelStd = rawAccelStd.clamped(to: 0...2000)

        let rawPauseCount = Double(recording.pausePoints.count)
        pauseCount = rawPauseCount.clamped(to: 0...20)

        let rawPatternLen = Double(recording.pattern.count)
        patternLen = rawPatternLen.clamped(to: 1...9)

        let rawTotalPause = recording.pausePoints.reduce(0.0) { $0 + $1.duration }
        totalPauseDuration = rawTotalPause.clamped(to: 0...10)

        let rawDuration = recording.duration
        duration = rawDuration.clamped(to: 0...30)

        featureDict = [
            "avgSpeed": MLFeatureValue(double: avgSpeed),
            "speedStdDev": MLFeatureValue(double: speedStd),
            "avgAcceleration": MLFeatureValue(double: avgAccel),
            "accelStdDev": MLFeatureValue(double: accelStd),
            "pauseCount": MLFeatureValue(double: pauseCount),
            "patternLength": MLFeatureValue(double: patternLen),
            "totalPauseDuration": MLFeatureValue(double: totalPauseDuration),
            "duration": MLFeatureValue(double: duration)
        ]

        for (key, value) in featureDict {
            guard let doubleValue = value.doubleValue else {
                throw StyleClassifierError.invalidFeature(name: key)
            }
            guard doubleValue.isFinite else {
                throw StyleClassifierError.nonFiniteFeature(name: key, value: doubleValue)
            }
        }
    }

    var featureNames: Set<String> {
        Set(featureDict.keys)
    }

    func featureValue(for featureName: String) -> MLFeatureValue? {
        featureDict[featureName]
    }

    private static func standardDeviation(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let mean = values.reduce(0, +) / Double(values.count)
        let sumOfSquares = values.reduce(0) { $0 + pow($1 - mean, 2) }
        let variance = sumOfSquares / Double(values.count - 1)
        let safeVariance = max(variance, 0).isFiniteOrZero
        return sqrt(safeVariance).isFiniteOrZero
    }
}

enum StyleClassifierError: Error {
    case invalidFeature(name: String)
    case nonFiniteFeature(name: String, value: Double)
    case modelUnavailable
}
