import Foundation
import CoreData
import Combine

final class iCloudSyncManager: ObservableObject {
    static let shared = iCloudSyncManager()

    @Published var syncStatus: SyncStatus = .idle
    @Published var lastSyncDate: Date?

    enum SyncStatus {
        case idle
        case syncing
        case success
        case failed(Error)

        var isSyncing: Bool {
            if case .syncing = self { return true }
            return false
        }
    }

    private var cancellables = Set<AnyCancellable>()

    private init() {
        setupRemoteChangeNotification()
    }

    private func setupRemoteChangeNotification() {
        NotificationCenter.default.publisher(for: .NSPersistentStoreRemoteChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handleRemoteChange(notification)
            }
            .store(in: &cancellables)
    }

    private func handleRemoteChange(_ notification: Notification) {
        syncStatus = .syncing
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.syncStatus = .success
            self?.lastSyncDate = Date()
        }
    }

    func triggerSync() {
        syncStatus = .syncing
        let context = PersistenceController.shared.container.viewContext
        context.perform { [weak self] in
            do {
                try context.save()
                DispatchQueue.main.async {
                    self?.syncStatus = .success
                    self?.lastSyncDate = Date()
                }
            } catch {
                DispatchQueue.main.async {
                    self?.syncStatus = .failed(error)
                }
            }
        }
    }
}

extension Notification.Name {
    static let iCloudSyncDidComplete = Notification.Name("iCloudSyncDidComplete")
}
