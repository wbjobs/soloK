import Foundation
import CoreData

@objc(MatchRecord)
public class MatchRecord: NSManagedObject {
    @NSManaged public var id: UUID?
    @NSManaged public var createdAt: Date?
    @NSManaged public var winnerName: String?
    @NSManaged public var winnerIsLocal: Bool
    @NSManaged public var opponentName: String?
    @NSManaged public var localDuration: Double
    @NSManaged public var opponentDuration: Double
    @NSManaged public var targetPattern: [Int]?
    @NSManaged public var localPattern: [Int]?
    @NSManaged public var opponentPattern: [Int]?
    @NSManaged public var localCorrect: Bool
    @NSManaged public var opponentCorrect: Bool
}

extension MatchRecord {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<MatchRecord> {
        return NSFetchRequest<MatchRecord>(entityName: "MatchRecord")
    }
}

extension MatchRecord: Identifiable {}
