import Foundation
import CoreData

extension GestureRecord {
    var styleClassification: GestureStyle {
        get {
            guard let rawValue = styleRawValue else { return .unknown }
            return GestureStyle(rawValue: rawValue) ?? .unknown
        }
        set {
            styleRawValue = newValue.rawValue
        }
    }
}
