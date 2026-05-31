import SwiftUI
import CoreData

struct StatisticsView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @State private var recordings: [GestureRecording] = []
    @State private var selectedTimeRange: TimeRange = .week

    enum TimeRange: String, CaseIterable {
        case day = "今天"
        case week = "本周"
        case month = "本月"
        case all = "全部"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                timeRangePicker

                overviewCards

                styleDistributionChart

                HeatmapView(recordings: filteredRecordings)

                if !filteredRecordings.isEmpty {
                    ReplayView(recordings: filteredRecordings)
                }

                historyList
            }
            .padding()
        }
        .onAppear {
            loadRecordings()
        }
    }

    private var filteredRecordings: [GestureRecording] {
        let calendar = Calendar.current
        let now = Date()

        return recordings.filter { recording in
            switch selectedTimeRange {
            case .day:
                return calendar.isDateInToday(recording.createdAt)
            case .week:
                guard let weekAgo = calendar.date(byAdding: .day, value: -7, to: now) else { return false }
                return recording.createdAt >= weekAgo
            case .month:
                guard let monthAgo = calendar.date(byAdding: .month, value: -1, to: now) else { return false }
                return recording.createdAt >= monthAgo
            case .all:
                return true
            }
        }
    }

    private var timeRangePicker: some View {
        Picker("时间范围", selection: $selectedTimeRange) {
            ForEach(TimeRange.allCases, id: \.self) { range in
                Text(range.rawValue).tag(range)
            }
        }
        .pickerStyle(.segmented)
    }

    private var overviewCards: some View {
        let data = filteredRecordings
        let total = data.count
        let successCount = data.filter(\.isSuccessful).count
        let successRate = total > 0 ? Double(successCount) / Double(total) * 100 : 0
        let avgDuration = total > 0 ? data.reduce(0) { $0 + $1.duration } / Double(total) : 0
        let avgSpeed = data.flatMap(\.speeds).isEmpty ? 0 : data.flatMap(\.speeds).reduce(0, +) / Double(data.flatMap(\.speeds).count)

        return LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 12) {
            StatCard(title: "成功率", value: String(format: "%.1f%%", successRate), icon: "checkmark.circle", color: .green)
            StatCard(title: "平均时长", value: String(format: "%.2fs", avgDuration), icon: "clock", color: .blue)
            StatCard(title: "平均速度", value: String(format: "%.0f", avgSpeed), icon: "speedometer", color: .orange)
        }
    }

    private var styleDistributionChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("风格分布")
                .font(.headline)

            let data = filteredRecordings
            let styleCounts = Dictionary(grouping: data, by: \.styleClassification)
                .mapValues { $0.count }
            let maxCount = styleCounts.values.max() ?? 1

            ForEach(GestureStyle.allCases.filter { $0 != .unknown }, id: \.self) { style in
                HStack {
                    Image(systemName: style.systemImage)
                        .foregroundColor(Color(hex: style.colorHex))
                        .frame(width: 20)
                    Text(style.rawValue)
                        .font(.subheadline)
                        .frame(width: 40, alignment: .leading)

                    GeometryReader { geometry in
                        let count = styleCounts[style] ?? 0
                        let progress = CGFloat(count) / CGFloat(maxCount)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(hex: style.colorHex))
                            .frame(width: geometry.size.width * progress)
                    }
                    .frame(height: 20)
                    .background(Color(.systemGray5))
                    .cornerRadius(4)

                    Text("\(styleCounts[style] ?? 0)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 30, alignment: .trailing)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private var historyList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("历史记录")
                .font(.headline)

            if filteredRecordings.isEmpty {
                Text("暂无训练记录")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                ForEach(filteredRecordings.reversed()) { recording in
                    HistoryRow(recording: recording)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private func loadRecordings() {
        let request: NSFetchRequest<GestureRecord> = GestureRecord.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(keyPath: \GestureRecord.createdAt, ascending: true)]

        do {
            let records = try viewContext.fetch(request)
            recordings = records.compactMap { record -> GestureRecording? in
                guard let id = record.id,
                      let createdAt = record.createdAt,
                      let pattern = record.pattern,
                      let trajectoryData = record.trajectoryData,
                      let speedsData = record.speedsData,
                      let accelerationsData = record.accelerationsData,
                      let pausePointsData = record.pausePointsData,
                      let styleRaw = record.styleRawValue else { return nil }

                let decoder = JSONDecoder()
                let trajectoryPoints = try? decoder.decode([TrajectoryPoint].self, from: trajectoryData)
                let speeds = try? decoder.decode([Double].self, from: speedsData)
                let accelerations = try? decoder.decode([Double].self, from: accelerationsData)
                let pausePoints = try? decoder.decode([PausePoint].self, from: pausePointsData)

                return GestureRecording(
                    pattern: pattern,
                    trajectoryPoints: trajectoryPoints ?? [],
                    duration: record.duration,
                    isSuccessful: record.isSuccessful,
                    styleClassification: GestureStyle(rawValue: styleRaw) ?? .unknown,
                    speeds: speeds ?? [],
                    accelerations: accelerations ?? [],
                    pausePoints: pausePoints ?? []
                )
            }
        } catch {
            print("Failed to load recordings: \(error)")
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

struct HistoryRow: View {
    let recording: GestureRecording

    private var patternDisplay: String {
        recording.pattern.map { String($0) }.joined(separator: "→")
    }

    var body: some View {
        HStack {
            Image(systemName: recording.styleClassification.systemImage)
                .foregroundColor(Color(hex: recording.styleClassification.colorHex))
                .font(.title3)

            VStack(alignment: .leading, spacing: 2) {
                Text(patternDisplay)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                Text(recording.createdAt, style: .date)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(String(format: "%.2fs", recording.duration))
                    .font(.subheadline)
                Text(recording.styleClassification.rawValue)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(hex: recording.styleClassification.colorHex).opacity(0.2))
                    .foregroundColor(Color(hex: recording.styleClassification.colorHex))
                    .cornerRadius(4)
            }
        }
        .padding(.vertical, 4)
    }
}
