import SwiftUI

struct ContentView: View {
    @State private var selectedTab: Tab = .draw

    enum Tab: CaseIterable {
        case draw, match, statistics, settings

        var title: LocalizedStringKey {
            switch self {
            case .draw: return "绘制"
            case .match: return "对战"
            case .statistics: return "统计"
            case .settings: return "设置"
            }
        }

        var systemImage: String {
            switch self {
            case .draw: return "hand.draw"
            case .match: return "gamecontroller"
            case .statistics: return "chart.bar"
            case .settings: return "gearshape"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GestureDrawingView()
                    .navigationTitle("手势密码训练")
            }
            .tabItem {
                Label(Tab.draw.title, systemImage: Tab.draw.systemImage)
            }
            .tag(Tab.draw)

            NavigationStack {
                MatchLobbyView()
                    .navigationTitle("多人对战")
            }
            .tabItem {
                Label(Tab.match.title, systemImage: Tab.match.systemImage)
            }
            .tag(Tab.match)

            NavigationStack {
                MatchStatisticsView()
                    .navigationTitle("对战统计")
            }
            .tabItem {
                Label("战绩", systemImage: "trophy")
            }
            .tag(Tab.statistics)

            NavigationStack {
                SettingsView()
                    .navigationTitle("设置")
            }
            .tabItem {
                Label(Tab.settings.title, systemImage: Tab.settings.systemImage)
            }
            .tag(Tab.settings)
        }
    }
}
