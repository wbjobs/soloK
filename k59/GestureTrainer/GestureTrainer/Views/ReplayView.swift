import SwiftUI

struct ReplayView: View {
    let recordings: [GestureRecording]
    @State private var selectedRecordingIndex: Int = 0
    @State private var isReplaying = false
    @State private var replayProgress: Double = 0
    @State private var replayTimer: Timer?
    @State private var displayedPattern: [Int] = []
    @State private var displayedTrajectory: [TrajectoryPoint] = []

    private var selectedRecording: GestureRecording? {
        guard selectedRecordingIndex < recordings.count else { return nil }
        return recordings[recordings.count - 1 - selectedRecordingIndex]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("回放动画")
                .font(.headline)

            recordingPicker

            if let recording = selectedRecording {
                replayCanvas(recording: recording)

                replayControls(recording: recording)

                replayProgress(recording: recording)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private var recordingPicker: some View {
        Picker("选择记录", selection: $selectedRecordingIndex) {
            ForEach(0..<min(recordings.count, 20), id: \.self) { index in
                let recording = recordings[recordings.count - 1 - index]
                Text("\(index + 1): \(recording.createdAt, style: .time) - \(recording.styleClassification.rawValue)")
                    .tag(index)
            }
        }
        .pickerStyle(.menu)
        .onChange(of: selectedRecordingIndex) { _ in
            stopReplay()
        }
    }

    private func replayCanvas(recording: GestureRecording) -> some View {
        Canvas { context, size in
            let scale = GridCoordinateSystem.scale(for: size)

            if displayedTrajectory.count > 1 {
                let path = buildTrajectoryPath(
                    points: displayedTrajectory,
                    scaleX: scale.x,
                    scaleY: scale.y
                )
                context.stroke(
                    path,
                    with: .color(.accentColor.opacity(0.5)),
                    style: PathStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
                )
            }

            for index in 0..<9 {
                let scaledPoint = GridCoordinateSystem.scaledPosition(for: index, in: size)
                let isSelected = displayedPattern.contains(index)
                let radius: CGFloat = isSelected ? 14 : 10

                let circle = Path(ellipseIn: CGRect(
                    x: scaledPoint.x - radius,
                    y: scaledPoint.y - radius,
                    width: radius * 2,
                    height: radius * 2
                ))

                if isSelected {
                    context.fill(circle, with: .color(.accentColor))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 5,
                        y: scaledPoint.y - 5,
                        width: 10,
                        height: 10
                    ))
                    context.fill(innerCircle, with: .color(.white))
                } else {
                    context.fill(circle, with: .color(.secondary.opacity(0.2)))
                }
            }

            if let lastPoint = displayedTrajectory.last {
                let scaledPoint = CGPoint(
                    x: lastPoint.location.x * scale.x,
                    y: lastPoint.location.y * scale.y
                )
                let cursor = Path(ellipseIn: CGRect(
                    x: scaledPoint.x - 6,
                    y: scaledPoint.y - 6,
                    width: 12,
                    height: 12
                ))
                context.fill(cursor, with: .color(.red))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(height: 250)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func replayControls(recording: GestureRecording) -> some View {
        HStack(spacing: 16) {
            Button {
                if isReplaying {
                    stopReplay()
                } else {
                    startReplay(recording: recording)
                }
            } label: {
                Image(systemName: isReplaying ? "stop.circle" : "play.circle")
                    .font(.title2)
                    .foregroundColor(.accentColor)
            }

            Button {
                replayProgress = 0
                startReplay(recording: recording)
            } label: {
                Image(systemName: "arrow.counterclockwise.circle")
                    .font(.title2)
                    .foregroundColor(.orange)
            }

            Text(String(format: "%.1fs / %.1fs", replayProgress * recording.duration, recording.duration))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private func replayProgress(recording: GestureRecording) -> some View {
        VStack(spacing: 4) {
            Slider(value: $replayProgress, in: 0...1) { isEditing in
                if !isEditing {
                    updateDisplayedState(recording: recording)
                }
            }

            HStack {
                ForEach(GestureStyle.allCases.filter { $0 != .unknown }, id: \.self) { style in
                    if style == recording.styleClassification {
                        HStack(spacing: 2) {
                            Image(systemName: style.systemImage)
                                .font(.caption2)
                            Text(style.rawValue)
                                .font(.caption2)
                        }
                        .foregroundColor(Color(hex: style.colorHex))
                    }
                }
                Spacer()
                Text("\(recording.pattern.count)个点 | \(recording.pausePoints.count)次停顿")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }

    private func startReplay(recording: GestureRecording) {
        stopReplay()
        isReplaying = true
        replayProgress = 0
        displayedPattern = []
        displayedTrajectory = []

        let totalDuration = recording.duration
        let points = recording.trajectoryPoints
        let interval = 0.016

        replayTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { timer in
            replayProgress += interval / totalDuration

            if replayProgress >= 1.0 {
                replayProgress = 1.0
                stopReplay()
            }

            updateDisplayedState(recording: recording)
        }
    }

    private func stopReplay() {
        isReplaying = false
        replayTimer?.invalidate()
        replayTimer = nil
    }

    private func updateDisplayedState(recording: GestureRecording) {
        let currentTime = replayProgress * recording.duration
        displayedTrajectory = recording.trajectoryPoints.filter { $0.timestamp <= currentTime }

        var pattern: [Int] = []
        for point in displayedTrajectory {
            if let gridIndex = point.gridIndex, !pattern.contains(gridIndex) {
                pattern.append(gridIndex)
            }
        }
        displayedPattern = pattern
    }

    private func buildTrajectoryPath(points: [TrajectoryPoint], scaleX: CGFloat, scaleY: CGFloat) -> Path {
        var path = Path()
        for (index, point) in points.enumerated() {
            let scaledPoint = CGPoint(
                x: point.location.x * scaleX,
                y: point.location.y * scaleY
            )
            if index == 0 {
                path.move(to: scaledPoint)
            } else {
                path.addLine(to: scaledPoint)
            }
        }
        return path
    }
}
