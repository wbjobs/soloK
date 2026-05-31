import SwiftUI

struct MatchDrawingView: View {
    @StateObject private var matchService = MultiplayerMatchService.shared
    @StateObject private var tracker = GestureTracker()
    @Environment(\.managedObjectContext) private var viewContext

    var body: some View {
        VStack(spacing: 16) {
            statusHeader

            targetPatternDisplay

            ZStack {
                MatchNineGridView(
                    pattern: tracker.currentPattern,
                    targetPattern: currentTargetPattern
                )

                GestureOverlay(
                    tracker: tracker,
                    viewModel: MatchDrawingViewModel()
                )
            }
            .aspectRatio(1, contentMode: .fit)

            progressFooter
        }
        .padding()
        .onChange(of: matchService.matchState) { newState in
            handleStateChange(newState)
        }
    }

    private var currentTargetPattern: [Int] {
        switch matchService.matchState {
        case .countdown(_, let pattern):
            return pattern
        case .drawing(_, let pattern):
            return pattern
        case .playerFinished, .opponentFinished:
            return []
        default:
            return []
        }
    }

    private func handleStateChange(_ newState: MatchState) {
        if case .drawing = newState {
            tracker.startTracking()
        }
    }

    private var statusHeader: some View {
        VStack(spacing: 8) {
            switch matchService.matchState {
            case .countdown(let remaining, _):
                Text("\(remaining)")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundColor(.accentColor)
                Text("准备开始")
                    .font(.title2)

            case .drawing(let startTime, _):
                HStack(spacing: 16) {
                    VStack {
                        Text("计时")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(String(format: "%.2fs", Date().timeIntervalSince(startTime)))
                            .font(.title2)
                            .fontWeight(.bold)
                            .monospacedDigit()
                    }

                    VStack {
                        Text("进度")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("\(tracker.currentPattern.count)/\(currentTargetPattern.count)")
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                }

            case .playerFinished:
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.green)
                    Text("等待对手完成...")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }

            case .opponentFinished:
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.orange)
                    Text("对手已完成! 加快速度!")
                        .font(.headline)
                        .foregroundColor(.orange)
                }

            default:
                EmptyView()
            }
        }
        .frame(height: 80)
    }

    private var targetPatternDisplay: some View {
        VStack(spacing: 8) {
            Text("目标手势")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 4) {
                ForEach(currentTargetPattern, id: \.self) { index in
                    Text("\(index)")
                        .font(.headline)
                        .fontWeight(.medium)
                        .frame(width: 32, height: 32)
                        .background(Color.accentColor.opacity(0.2))
                        .cornerRadius(8)

                    if index != currentTargetPattern.last {
                        Image(systemName: "arrow.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    private var progressFooter: some View {
        VStack(spacing: 12) {
            if case .drawing = matchService.matchState {
                HStack {
                    Text("已连接点: ")
                        .font(.caption)
                        .foregroundColor(.secondary) +
                    Text(tracker.currentPattern.map { String($0) }.joined(separator: " → "))
                        .font(.caption)
                        .fontWeight(.medium)
                }

                Button {
                    submitDrawing()
                } label: {
                    Text("提交手势")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(tracker.currentPattern.count >= 4 ? Color.green : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .disabled(tracker.currentPattern.count < 4)
            }
        }
    }

    private func submitDrawing() {
        guard case .drawing(let startTime, _) = matchService.matchState else { return }

        let duration = Date().timeIntervalSince(startTime)
        let pattern = tracker.currentPattern

        _ = tracker.stopTracking()

        matchService.finishDrawing(pattern: pattern, duration: duration)
        saveMatchResult(pattern: pattern, duration: duration)
    }

    private func saveMatchResult(pattern: [Int], duration: TimeInterval) {
        viewContext.perform {
            let record = GestureRecord(context: viewContext)
            record.id = UUID()
            record.createdAt = Date()
            record.duration = duration
            record.isSuccessful = pattern == currentTargetPattern
            record.styleRawValue = GestureStyle.confident.rawValue
            record.pattern = pattern

            do {
                let encoder = JSONEncoder()
                record.trajectoryData = try encoder.encode(tracker.trajectoryPoints)
                record.speedsData = try encoder.encode(tracker.speeds)
                record.accelerationsData = try encoder.encode(tracker.accelerations)
                record.pausePointsData = try encoder.encode(tracker.pausePoints)

                try viewContext.save()
            } catch {
                print("Failed to save match gesture: \(error)")
            }
        }
    }
}

struct MatchNineGridView: View {
    let pattern: [Int]
    let targetPattern: [Int]

    var body: some View {
        Canvas { context, size in
            let scale = GridCoordinateSystem.scale(for: size)

            if pattern.count > 1 {
                var path = Path()
                for (index, gridIndex) in pattern.enumerated() {
                    let point = GridCoordinateSystem.position(for: gridIndex)
                    let scaledPoint = CGPoint(x: point.x * scale.x, y: point.y * scale.y)
                    if index == 0 {
                        path.move(to: scaledPoint)
                    } else {
                        path.addLine(to: scaledPoint)
                    }
                }
                context.stroke(
                    path,
                    with: .color(.green.opacity(0.6)),
                    style: PathStyle(lineWidth: 4, lineCap: .round, lineJoin: .round)
                )
            }

            for index in 0..<9 {
                let scaledPoint = GridCoordinateSystem.scaledPosition(for: index, in: size)
                let isSelected = pattern.contains(index)
                let isTarget = targetPattern.contains(index)

                let radius: CGFloat = isSelected ? 16 : 12

                let circle = Path(ellipseIn: CGRect(
                    x: scaledPoint.x - radius,
                    y: scaledPoint.y - radius,
                    width: radius * 2,
                    height: radius * 2
                ))

                if isSelected {
                    context.fill(circle, with: .color(.green))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 6,
                        y: scaledPoint.y - 6,
                        width: 12,
                        height: 12
                    ))
                    context.fill(innerCircle, with: .color(.white))
                } else if isTarget {
                    context.stroke(circle, with: .color(.accentColor), style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 4,
                        y: scaledPoint.y - 4,
                        width: 8,
                        height: 8
                    ))
                    context.fill(innerCircle, with: .color(.accentColor.opacity(0.5)))
                } else {
                    context.fill(circle, with: .color(.secondary.opacity(0.2)))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 4,
                        y: scaledPoint.y - 4,
                        width: 8,
                        height: 8
                    ))
                    context.fill(innerCircle, with: .color(.secondary.opacity(0.4)))
                }

                let numberText = Text("\(index)")
                    .font(.system(size: radius * 0.6, weight: .semibold))
                    .foregroundColor(isSelected ? .white : isTarget ? .accentColor : .secondary)
                context.draw(numberText, at: scaledPoint)
            }
        }
        .background(Color(.systemBackground))
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
}

final class MatchDrawingViewModel: ObservableObject {}
