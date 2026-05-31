import SwiftUI

@main
struct GestureTrainerApp: App {
    @StateObject private var persistenceController = PersistenceController.shared
    @StateObject private var iCloudSyncManager = iCloudSyncManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
                .environmentObject(iCloudSyncManager)
        }
    }
}
