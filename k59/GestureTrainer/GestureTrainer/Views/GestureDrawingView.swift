import SwiftUI

struct GestureDrawingView: View {
    @StateObject private var tracker = GestureTracker()
    @StateObject private var viewModel = GestureDrawingViewModel()
    @Environment(\.managedObjectContext) private var viewContext

    var body: some View {
        VStack(spacing: 20) {
            instructionBar

            ZStack {
                NineGridView(
                    pattern: tracker.currentPattern,
                    isTracking: tracker.isTracking
                )

                GestureOverlay(
                    tracker: tracker,
                    viewModel: viewModel
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            drawingControls

            if let lastRecording = viewModel.lastRecording {
                resultCard(recording: lastRecording)
            }
        }
        .padding()
    }

    private var instructionBar: some View {
        HStack {
            Image(systemName: "info.circle")
                .foregroundColor(.blue)
            Text(tracker.isTracking ? "请绘制手势密码（至少4个点）" : "点击\"开始绘制\"后在九宫格上滑动")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            if tracker.isTracking {
                Text("\(tracker.currentPattern.count) 个点")
                    .font(.headline)
                    .foregroundColor(.accentColor)
            }
        }
        .padding(.horizontal)
    }

    private var drawingControls: some View {
        HStack(spacing: 20) {
            Button {
                if tracker.isTracking {
                    if let recording = tracker.stopTracking() {
                        viewModel.processRecording(recording, context: viewContext)
                    } else {
                        viewModel.errorMessage = "至少需要连接\(GestureRecording.minimumPatternLength)个点"
                    }
                } else {
                    tracker.startTracking()
                }
            } label: {
                Label(
                    tracker.isTracking ? "完成绘制" : "开始绘制",
                    systemImage: tracker.isTracking ? "checkmark.circle" : "hand.draw"
                )
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(tracker.isTracking ? Color.green : Color.accentColor)
                .foregroundColor(.white)
                .cornerRadius(12)
            }

            if tracker.isTracking {
                Button {
                    tracker.startTracking()
                } label: {
                    Label("重置", systemImage: "arrow.counterclockwise")
                        .font(.headline)
                        .padding()
                        .background(Color.orange)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
        }
    }

    private func resultCard(recording: GestureRecording) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("绘制结果")
                    .font(.headline)
                Spacer()
                styleBadge(recording.styleClassification)
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading) {
                    Text("时长")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(String(format: "%.2fs", recording.duration))
                        .font(.subheadline)
                        .fontWeight(.medium)
                }

                VStack(alignment: .leading) {
                    Text("平均速度")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(String(format: "%.1f pts/s", recording.speeds.isEmpty ? 0 : recording.speeds.reduce(0, +) / Double(recording.speeds.count)))
                        .font(.subheadline)
                        .fontWeight(.medium)
                }

                VStack(alignment: .leading) {
                    Text("停顿")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(recording.pausePoints.count) 次")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func styleBadge(_ style: GestureStyle) -> some View {
        HStack(spacing: 4) {
            Image(systemName: style.systemImage)
                .font(.caption2)
            Text(style.rawValue)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(hex: style.colorHex).opacity(0.2))
        .foregroundColor(Color(hex: style.colorHex))
        .cornerRadius(8)
    }
}

struct NineGridView: View {
    let pattern: [Int]
    let isTracking: Bool

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
                    with: .color(.accentColor.opacity(0.6)),
                    style: PathStyle(lineWidth: 4, lineCap: .round, lineJoin: .round)
                )
            }

            for index in 0..<9 {
                let scaledPoint = GridCoordinateSystem.scaledPosition(for: index, in: size)
                let isSelected = pattern.contains(index)
                let radius: CGFloat = isSelected ? 16 : 12

                let circle = Path(ellipseIn: CGRect(
                    x: scaledPoint.x - radius,
                    y: scaledPoint.y - radius,
                    width: radius * 2,
                    height: radius * 2
                ))

                if isSelected {
                    context.fill(circle, with: .color(.accentColor))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 6,
                        y: scaledPoint.y - 6,
                        width: 12,
                        height: 12
                    ))
                    context.fill(innerCircle, with: .color(.white))
                } else {
                    context.fill(circle, with: .color(.secondary.opacity(0.3)))
                    let innerCircle = Path(ellipseIn: CGRect(
                        x: scaledPoint.x - 4,
                        y: scaledPoint.y - 4,
                        width: 8,
                        height: 8
                    ))
                    context.fill(innerCircle, with: .color(.secondary.opacity(0.6)))
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .background(Color(.systemBackground))
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 4)
    }
}

struct GestureOverlay: UIViewRepresentable {
    @ObservedObject var tracker: GestureTracker
    @ObservedObject var viewModel: GestureDrawingViewModel

    func makeUIView(context: Context) -> GestureOverlayView {
        let view = GestureOverlayView()
        view.tracker = tracker
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: GestureOverlayView, context: Context) {}
}

class GestureOverlayView: UIView {
    weak var tracker: GestureTracker?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, let tracker = tracker else { return }
        let location = touch.location(in: self)
        tracker.handleTouch(at: location, gridSize: bounds.size)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, let tracker = tracker else { return }
        let location = touch.location(in: self)
        tracker.handleTouch(at: location, gridSize: bounds.size)
        setNeedsDisplay()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let tracker = tracker else { return }
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let tracker = tracker, !tracker.trajectoryPoints.isEmpty else { return }

        let scale = GridCoordinateSystem.scale(for: bounds.size)

        let path = UIBezierPath()
        for (index, point) in tracker.trajectoryPoints.enumerated() {
            let scaledPoint = CGPoint(
                x: point.location.x * scale.x,
                y: point.location.y * scale.y
            )
            if index == 0 {
                path.move(to: scaledPoint)
            } else {
                path.addLine(to: scaledPoint)
            }
        }

        UIColor.accentColor.withAlphaComponent(0.3).setStroke()
        path.lineWidth = 3
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.stroke()
    }
}

final class GestureDrawingViewModel: ObservableObject {
    @Published var lastRecording: GestureRecording?
    @Published var errorMessage: String?

    private let classifier = StyleClassifier.shared

    func processRecording(_ recording: GestureRecording, context: NSManagedObjectContext) {
        let style = classifier.classify(recording: recording)
        var classifiedRecording = recording
        classifiedRecording.styleClassification = style
        lastRecording = classifiedRecording
        errorMessage = nil
        saveToCoreData(classifiedRecording, context: context)
    }

    private func saveToCoreData(_ recording: GestureRecording, context: NSManagedObjectContext) {
        context.perform {
            let record = GestureRecord(context: context)
            record.id = recording.id
            record.createdAt = recording.createdAt
            record.duration = recording.duration
            record.isSuccessful = recording.isSuccessful
            record.styleRawValue = recording.styleClassification.rawValue
            record.pattern = recording.pattern

            do {
                let encoder = JSONEncoder()
                record.trajectoryData = try encoder.encode(recording.trajectoryPoints)
                record.speedsData = try encoder.encode(recording.speeds)
                record.accelerationsData = try encoder.encode(recording.accelerations)
                record.pausePointsData = try encoder.encode(recording.pausePoints)

                try context.save()
            } catch {
                print("Failed to save gesture recording: \(error)")
            }
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
