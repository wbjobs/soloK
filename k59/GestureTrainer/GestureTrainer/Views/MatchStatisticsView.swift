import SwiftUI
import CoreData

struct MatchStatisticsView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \MatchRecord.createdAt, ascending: false)],
        animation: .default
    ) private var matchRecords: FetchedResults<MatchRecord>

    private var totalWins: Int {
        matchRecords.filter { $0.winnerIsLocal }.count
    }

    private var totalLosses: Int {
        matchRecords.count - totalWins
    }

    private var winRate: Double {
        matchRecords.isEmpty ? 0 : Double(totalWins) / Double(matchRecords.count) * 100
    }

    private var averageWinDuration: Double {
        let wins = matchRecords.filter { $0.winnerIsLocal }
        guard !wins.isEmpty else { return 0 }
        return wins.reduce(0) { $0 + $1.localDuration } / Double(wins.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                overviewCards
                winLossChart
                recentMatchHistory
            }
            .padding()
        }
        .navigationTitle("对战统计")
    }

    private var overviewCards: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 12) {
            StatCard(
                title: "总场次",
                value: "\(matchRecords.count)",
                icon: "gamecontroller",
                color: .blue
            )
            StatCard(
                title: "胜率",
                value: String(format: "%.1f%%", winRate),
                icon: winRate >= 50 ? "trophy" : "chart.line.uptrend.xyaxis",
                color: winRate >= 50 ? .yellow : .gray
            )
            StatCard(
                title: "平均获胜时长",
                value: String(format: "%.2fs", averageWinDuration),
                icon: "stopwatch",
                color: .green
            )
        }
    }

    private var winLossChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("胜负分布")
                .font(.headline)

            HStack(alignment: .bottom, spacing: 40) {
                VStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .stroke(Color.green.opacity(0.2), lineWidth: 15)
                        Circle()
                            .trim(from: 0, to: CGFloat(winRate / 100))
                            .stroke(Color.green, style: StrokeStyle(lineWidth: 15, lineCap: .round))
                            .rotationEffect(.degrees(-90))

                        VStack(spacing: 4) {
                            Text("\(totalWins)")
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.green)
                            Text("胜")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .frame(width: 120, height: 120)

                    Text("胜利")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }

                VStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .stroke(Color.red.opacity(0.2), lineWidth: 15)
                        Circle()
                            .trim(from: 0, to: CGFloat((100 - winRate) / 100))
                            .stroke(Color.red, style: StrokeStyle(lineWidth: 15, lineCap: .round))
                            .rotationEffect(.degrees(-90))

                        VStack(spacing: 4) {
                            Text("\(totalLosses)")
                                .font(.title)
                                .fontWeight(.bold)
                                .foregroundColor(.red)
                            Text("负")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .frame(width: 120, height: 120)

                    Text("失败")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private var recentMatchHistory: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最近对战")
                .font(.headline)

            if matchRecords.isEmpty {
                Text("暂无对战记录")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                ForEach(Array(matchRecords.prefix(10))) { record in
                    MatchHistoryRow(record: record)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

struct MatchHistoryRow: View {
    let record: MatchRecord

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: record.winnerIsLocal ? "crown.fill" : "xmark.circle.fill")
                .font(.title2)
                .foregroundColor(record.winnerIsLocal ? .yellow : .red)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(record.winnerIsLocal ? "胜利" : "失败")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(record.winnerIsLocal ? .green : .red)

                Text("vs \(record.opponentName ?? "对手")")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                HStack(spacing: 12) {
                    VStack(spacing: 2) {
                        Text("你")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(String(format: "%.2fs", record.localDuration))
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(record.localCorrect ? .green : .red)
                    }

                    VStack(spacing: 2) {
                        Text("对手")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(String(format: "%.2fs", record.opponentDuration))
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(record.opponentCorrect ? .green : .red)
                    }
                }

                Text(record.createdAt ?? Date(), style: .date)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 8)

        if record.id != (record as AnyObject) as? MatchRecord?.map({ $0 }).last?.id {
            Divider()
        }
    }
}
