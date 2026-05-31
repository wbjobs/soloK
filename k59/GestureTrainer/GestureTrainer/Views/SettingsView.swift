import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var iCloudSyncManager: iCloudSyncManager
    @Environment(\.managedObjectContext) private var viewContext
    @AppStorage("minimumPatternLength") private var minimumPatternLength = 4
    @AppStorage("enableHapticFeedback") private var enableHapticFeedback = true
    @AppStorage("enableSoundEffects") private var enableSoundEffects = true
    @AppStorage("replaySpeed") private var replaySpeed = 1.0
    @State private var showClearDataAlert = false

    var body: some View {
        Form {
            Section(header: Text("绘制设置")) {
                Stepper(
                    "最少连接点数: \(minimumPatternLength)",
                    value: Binding(
                        get: { minimumPatternLength },
                        set: { minimumPatternLength = max(4, min(9, $0)) }
                    ),
                    in: 4...9
                )

                Toggle("触觉反馈", isOn: $enableHapticFeedback)
                Toggle("音效", isOn: $enableSoundEffects)
            }

            Section(header: Text("回放设置")) {
                VStack(alignment: .leading) {
                    Text("回放速度: \(String(format: "%.1fx", replaySpeed))")
                    Slider(value: $replaySpeed, in: 0.25...3.0, step: 0.25)
                }
            }

            Section(header: Text("iCloud 同步")) {
                HStack {
                    Text("同步状态")
                    Spacer()
                    syncStatusView
                }

                if let lastSync = iCloudSyncManager.lastSyncDate {
                    HStack {
                        Text("上次同步")
                        Spacer()
                        Text(lastSync, style: .relative)
                            .foregroundColor(.secondary)
                    }
                }

                Button {
                    iCloudSyncManager.triggerSync()
                } label: {
                    HStack {
                        Image(systemName: "arrow.triangle.2.circlepath")
                        Text("立即同步")
                    }
                }
                .disabled(iCloudSyncManager.syncStatus.isSyncing)
            }

            Section(header: Text("数据管理")) {
                Button(role: .destructive) {
                    showClearDataAlert = true
                } label: {
                    HStack {
                        Image(systemName: "trash")
                        Text("清除所有训练数据")
                    }
                }
            }

            Section(header: Text("关于")) {
                HStack {
                    Text("版本")
                    Spacer()
                    Text("1.0.0")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("模型版本")
                    Spacer()
                    Text("规则引擎 v1 / Core ML")
                        .foregroundColor(.secondary)
                }
            }
        }
        .alert("确认清除数据", isPresented: $showClearDataAlert) {
            Button("取消", role: .cancel) {}
            Button("清除", role: .destructive) {
                clearAllData()
            }
        } message: {
            Text("此操作将删除所有训练记录，且不可恢复。")
        }
    }

    @ViewBuilder
    private var syncStatusView: some View {
        switch iCloudSyncManager.syncStatus {
        case .idle:
            Label("空闲", systemImage: "icloud")
                .foregroundColor(.secondary)
        case .syncing:
            Label("同步中...", systemImage: "arrow.triangle.2.circlepath")
                .foregroundColor(.blue)
        case .success:
            Label("已同步", systemImage: "checkmark.icloud")
                .foregroundColor(.green)
        case .failed:
            Label("同步失败", systemImage: "exclamationmark.icloud")
                .foregroundColor(.red)
        }
    }

    private func clearAllData() {
        let request: NSFetchRequest<NSFetchRequestResult> = GestureRecord.fetchRequest()
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

        do {
            try viewContext.execute(deleteRequest)
            try viewContext.save()
        } catch {
            print("Failed to clear data: \(error)")
        }
    }
}
