import Foundation
import CoreData

@objc(GestureRecord)
public class GestureRecord: NSManagedObject {
    @NSManaged public var id: UUID?
    @NSManaged public var createdAt: Date?
    @NSManaged public var pattern: [Int]?
    @NSManaged public var trajectoryData: Data?
    @NSManaged public var duration: Double
    @NSManaged public var isSuccessful: Bool
    @NSManaged public var styleRawValue: String?
    @NSManaged public var speedsData: Data?
    @NSManaged public var accelerationsData: Data?
    @NSManaged public var pausePointsData: Data?
}

extension GestureRecord {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<GestureRecord> {
        return NSFetchRequest<GestureRecord>(entityName: "GestureRecord")
    }
}

extension GestureRecord: Identifiable {}
