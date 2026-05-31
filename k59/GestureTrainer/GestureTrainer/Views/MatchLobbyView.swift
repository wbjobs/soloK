import SwiftUI
import MultipeerConnectivity

struct MatchLobbyView: View {
    @StateObject private var matchService = MultiplayerMatchService.shared
    @State private var showMatchView = false
    @State private var matchResult: MatchResult?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                headerSection

                if case .idle = matchService.matchState {
                    idleView
                } else if case .advertising = matchService.matchState {
                    advertisingView
                } else if case .browsing = matchService.matchState {
                    browsingView
                } else if case .connected = matchService.matchState {
                    connectingView
                } else if case .readyToStart = matchService.matchState {
                    readyView
                } else if case .countdown = matchService.matchState ||
                            case .drawing = matchService.matchState ||
                            case .playerFinished = matchService.matchState ||
                            case .opponentFinished = matchService.matchState {
                    matchView
                } else if case .matchResult = matchService.matchState {
                    matchResultView
                } else if case .disconnected = matchService.matchState {
                    disconnectedView
                }

                Spacer()
            }
            .padding()
            .navigationTitle("多人对战")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "gamecontroller")
                .font(.system(size: 50))
                .foregroundColor(.accentColor)

            Text("手势密码对战")
                .font(.title2)
                .fontWeight(.bold)

            Text("比拼相同手势密码的绘制速度")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.top, 20)
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Button {
                matchService.startAdvertising()
            } label: {
                HStack {
                    Image(systemName: "wifi.router")
                    Text("创建房间")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.accentColor)
                .foregroundColor(.white)
                .cornerRadius(12)
            }

            Button {
                matchService.startBrowsing()
            } label: {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text("搜索对手")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.systemGray5))
                .foregroundColor(.primary)
                .cornerRadius(12)
            }
        }
        .padding(.horizontal, 40)
    }

    private var advertisingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)

            Text("等待对手加入...")
                .font(.headline)

            Text("设备名称: \(matchService.localPlayerName)")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Button {
                matchService.disconnect()
            } label: {
                Text("取消")
                    .font(.headline)
                    .foregroundColor(.red)
            }
        }
        .padding(.top, 40)
    }

    private var browsingView: some View {
        VStack(spacing: 16) {
            HStack {
                ProgressView()
                Text("正在搜索附近设备...")
                    .font(.headline)
            }

            if matchService.discoveredPeers.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "person.slash")
                        .font(.system(size: 40))
                        .foregroundColor(.secondary)
                    Text("未发现其他设备")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)
            } else {
                List(matchService.discoveredPeers, id: \.self) { peer in
                    HStack {
                        Image(systemName: "person.crop.circle")
                            .font(.title2)
                            .foregroundColor(.accentColor)
                        Text(peer.displayName)
                            .font(.headline)
                        Spacer()
                        Button("邀请") {
                            matchService.invitePeer(peer)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.vertical, 8)
                }
                .listStyle(.plain)
                .frame(maxHeight: 200)
            }

            Button {
                matchService.disconnect()
            } label: {
                Text("取消搜索")
                    .font(.headline)
                    .foregroundColor(.red)
            }
        }
        .padding(.top, 20)
    }

    private var connectingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)

            Text("正在建立连接...")
                .font(.headline)
        }
        .padding(.top, 40)
    }

    private var readyView: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("对手已就绪!")
                .font(.title)
                .fontWeight(.bold)

            if case .readyToStart(let opponentName) = matchService.matchState {
                Text("对手: \(opponentName)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            VStack(spacing: 12) {
                Text("比赛规则")
                    .font(.headline)
                VStack(alignment: .leading, spacing: 8) {
                    Text("• 双方绘制相同的手势密码")
                    Text("• 速度快且正确者获胜")
                    Text("• 若均错误则为平局")
                }
                .font(.subheadline)
                .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)

            Button {
                matchService.startMatch()
            } label: {
                Text("开始比赛")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }

            Button {
                matchService.disconnect()
            } label: {
                Text("取消")
                    .font(.headline)
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal, 40)
    }

    private var matchView: some View {
        MatchDrawingView()
    }

    private var matchResultView: some View {
        VStack(spacing: 24) {
            if case .matchResult(let result) = matchService.matchState {
                VStack(spacing: 12) {
                    Image(systemName: result.winnerIsLocal ? "trophy.fill" : "hand.thumbsdown")
                        .font(.system(size: 70))
                        .foregroundColor(result.winnerIsLocal ? .yellow : .gray)

                    Text(result.winnerIsLocal ? "你赢了!" : "你输了!")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("胜者: \(result.winner)")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }

                VStack(spacing: 16) {
                    HStack(spacing: 24) {
                        VStack(spacing: 8) {
                            Text("你")
                                .font(.headline)
                            Text(String(format: "%.2fs", result.localDuration))
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(result.localCorrect ? .green : .red)
                            Text(result.localCorrect ? "✓ 正确" : "✗ 错误")
                                .font(.caption)
                                .foregroundColor(result.localCorrect ? .green : .red)
                        }
                        .frame(maxWidth: .infinity)

                        Text("VS")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)

                        VStack(spacing: 8) {
                            Text("对手")
                                .font(.headline)
                            Text(String(format: "%.2fs", result.opponentDuration))
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(result.opponentCorrect ? .green : .red)
                            Text(result.opponentCorrect ? "✓ 正确" : "✗ 错误")
                                .font(.caption)
                                .foregroundColor(result.opponentCorrect ? .green : .red)
                        }
                        .frame(maxWidth: .infinity)
                    }

                    VStack(spacing: 8) {
                        Text("目标手势")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(result.targetPattern.map { String($0) }.joined(separator: " → "))
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(16)
                .shadow(color: .black.opacity(0.1), radius: 8)

                HStack(spacing: 16) {
                    Button {
                        matchService.disconnect()
                    } label: {
                        Text("返回大厅")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .foregroundColor(.primary)
                            .cornerRadius(12)
                    }

                    Button {
                        matchService.startMatch()
                    } label: {
                        Text("再来一局")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private var disconnectedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 50))
                .foregroundColor(.orange)

            if case .disconnected(let reason) = matchService.matchState {
                Text(reason)
                    .font(.headline)
                    .multilineTextAlignment(.center)
            }

            Button {
            } label: {
                Text("返回")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 40)
        }
    }
}
