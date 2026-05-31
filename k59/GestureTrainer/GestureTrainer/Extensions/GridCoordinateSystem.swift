import Foundation
import CoreGraphics

enum GridCoordinateSystem {
    static let gridWorldSize: CGFloat = 300
    static let gridMargin: CGFloat = 50
    static let gridSpacing: CGFloat = 100

    static func position(for index: Int) -> CGPoint {
        let row = index / 3
        let col = index % 3
        return CGPoint(
            x: gridMargin + CGFloat(col) * gridSpacing,
            y: gridMargin + CGFloat(row) * gridSpacing
        )
    }

    static func cellRect(for index: Int, in size: CGSize) -> CGRect {
        let row = index / 3
        let col = index % 3
        let scaleX = size.width / gridWorldSize
        let scaleY = size.height / gridWorldSize
        let cellSize = CGSize(
            width: gridSpacing * scaleX,
            height: gridSpacing * scaleY
        )
        let cellOrigin = CGPoint(
            x: (gridMargin - gridSpacing / 2) * scaleX + CGFloat(col) * cellSize.width,
            y: (gridMargin - gridSpacing / 2) * scaleY + CGFloat(row) * cellSize.height
        )
        return CGRect(origin: cellOrigin, size: cellSize)
    }

    static func cellCenteredRect(for index: Int, in size: CGSize, padding: CGFloat = 4) -> CGRect {
        let rawRect = cellRect(for: index, in: size)
        return rawRect.insetBy(dx: padding, dy: padding)
    }

    static func scale(for size: CGSize) -> (x: CGFloat, y: CGFloat) {
        (x: size.width / gridWorldSize, y: size.height / gridWorldSize)
    }

    static func scaledPosition(for index: Int, in size: CGSize) -> CGPoint {
        let pos = position(for: index)
        let scale = Self.scale(for: size)
        return CGPoint(x: pos.x * scale.x, y: pos.y * scale.y)
    }
}

extension Double {
    var isFiniteOrZero: Double {
        if isNaN || isInfinite { return 0 }
        return self
    }

    func clamped(to range: ClosedRange<Double>) -> Double {
        let value = isFiniteOrZero
        return min(max(value, range.lowerBound), range.upperBound)
    }
}
