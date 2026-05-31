import SwiftUI

struct HeatmapView: View {
    let recordings: [GestureRecording]

    private var gridFrequencies: [Int: Int] {
        var frequencies = Dictionary(uniqueKeysWithValues: (0..<9).map { ($0, 0) })
        for recording in recordings {
            for gridIndex in recording.pattern {
                frequencies[gridIndex, default: 0] += 1
            }
        }
        return frequencies
    }

    private var maxFrequency: Int {
        gridFrequencies.values.max() ?? 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("绘制热力图")
                .font(.headline)

            Text("显示各节点被选中的频率")
                .font(.caption)
                .foregroundColor(.secondary)

            Canvas { context, size in
                let frequencies = gridFrequencies
                let maxFreq = maxFrequency

                for index in 0..<9 {
                    let frequency = frequencies[index] ?? 0
                    let intensity = maxFreq > 0 ? Double(frequency) / Double(maxFreq) : 0

                    let cellRect = GridCoordinateSystem.cellCenteredRect(
                        for: index,
                        in: size,
                        padding: 3
                    )

                    let cellPath = RoundedRectangle(cornerRadius: 8).path(in: cellRect)
                    let color = interpolateColor(intensity: intensity)
                    context.fill(cellPath, with: .color(color))

                    let centerPoint = GridCoordinateSystem.scaledPosition(for: index, in: size)
                    let cellSize = min(cellRect.width, cellRect.height)

                    let numberText = Text("\(index)")
                        .font(.system(size: cellSize * 0.3, weight: .bold))
                        .foregroundColor(intensity > 0.5 ? .white : .primary)

                    context.draw(numberText, at: CGPoint(x: centerPoint.x, y: centerPoint.y - cellSize * 0.1))

                    let freqText = Text("\(frequency)次")
                        .font(.system(size: cellSize * 0.15))
                        .foregroundColor(intensity > 0.5 ? .white.opacity(0.8) : .secondary)

                    context.draw(freqText, at: CGPoint(x: centerPoint.x, y: centerPoint.y + cellSize * 0.2))
                }

                for index in 0..<9 {
                    let centerPoint = GridCoordinateSystem.scaledPosition(for: index, in: size)
                    let radius: CGFloat = 3
                    let circle = Path(ellipseIn: CGRect(
                        x: centerPoint.x - radius,
                        y: centerPoint.y - radius,
                        width: radius * 2,
                        height: radius * 2
                    ))
                    context.fill(circle, with: .color(.white.opacity(0.6)))
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 280)

            heatmapLegend
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private var heatmapLegend: some View {
        HStack {
            Text("低频")
                .font(.caption2)
                .foregroundColor(.secondary)
            LinearGradient(
                colors: [
                    Color.blue.opacity(0.1),
                    Color.blue.opacity(0.4),
                    Color.orange,
                    Color.red
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(height: 8)
            .cornerRadius(4)
            Text("高频")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    private func interpolateColor(intensity: Double) -> Color {
        let safeIntensity = intensity.clamped(to: 0...1)

        if safeIntensity < 0.33 {
            let t = safeIntensity / 0.33
            return Color.blue.opacity(0.1 + t * 0.3)
        } else if safeIntensity < 0.66 {
            let t = (safeIntensity - 0.33) / 0.33
            return Color(
                red: 1.0 * t,
                green: 0.6 * (1 - t) + 0.4 * t,
                blue: 1.0 * (1 - t)
            )
        } else {
            let t = (safeIntensity - 0.66) / 0.34
            return Color(
                red: 1.0,
                green: 0.4 * (1 - t),
                blue: 0.0
            ).opacity(0.7 + t * 0.3)
        }
    }
}
