package virtuallimit

import (
	"fmt"

	"digitaltwin/internal/models"
)

type LimitChecker struct {
	limits map[string]*models.VirtualLimit
}

func NewLimitChecker() *LimitChecker {
	return &LimitChecker{
		limits: make(map[string]*models.VirtualLimit),
	}
}

func (lc *LimitChecker) SetLimit(deviceID string, limit *models.VirtualLimit) {
	lc.limits[deviceID] = limit
}

func (lc *LimitChecker) GetLimit(deviceID string) *models.VirtualLimit {
	return lc.limits[deviceID]
}

func (lc *LimitChecker) RemoveLimit(deviceID string) {
	delete(lc.limits, deviceID)
}

func (lc *LimitChecker) CheckPosition(deviceID string, pos models.Vector3) (bool, string) {
	limit, ok := lc.limits[deviceID]
	if !ok || !limit.IsActive {
		return true, ""
	}

	if pos.X < limit.Bounds.XMin || pos.X > limit.Bounds.XMax {
		return false, fmt.Sprintf("X坐标 %.2f 超出范围 [%.2f, %.2f]", pos.X, limit.Bounds.XMin, limit.Bounds.XMax)
	}
	if pos.Y < limit.Bounds.YMin || pos.Y > limit.Bounds.YMax {
		return false, fmt.Sprintf("Y坐标 %.2f 超出范围 [%.2f, %.2f]", pos.Y, limit.Bounds.YMin, limit.Bounds.YMax)
	}
	if pos.Z < limit.Bounds.ZMin || pos.Z > limit.Bounds.ZMax {
		return false, fmt.Sprintf("Z坐标 %.2f 超出范围 [%.2f, %.2f]", pos.Z, limit.Bounds.ZMin, limit.Bounds.ZMax)
	}

	return true, ""
}

func (lc *LimitChecker) CheckTargetMove(deviceID string, currentPos, targetPos models.Vector3, stepSize float64) ([]models.Vector3, bool, string) {
	limit, ok := lc.limits[deviceID]
	if !ok || !limit.IsActive {
		return []models.Vector3{targetPos}, true, ""
	}

	var path []models.Vector3
	steps := int(1.0 / stepSize)
	if steps < 1 {
		steps = 1
	}

	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		intermediate := models.Vector3{
			X: currentPos.X + (targetPos.X-currentPos.X)*t,
			Y: currentPos.Y + (targetPos.Y-currentPos.Y)*t,
			Z: currentPos.Z + (targetPos.Z-currentPos.Z)*t,
		}

		valid, msg := lc.CheckPosition(deviceID, intermediate)
		if !valid {
			return path, false, fmt.Sprintf("路径超出限制: %s", msg)
		}
		path = append(path, intermediate)
	}

	return path, true, ""
}

func DefaultBounds() models.Bounds3D {
	return models.Bounds3D{
		XMin: -2.0, XMax: 2.0,
		YMin: 0.0, YMax: 3.0,
		ZMin: -2.0, ZMax: 2.0,
	}
}

func NewDefaultLimit(deviceID string) *models.VirtualLimit {
	return &models.VirtualLimit{
		DeviceID: deviceID,
		Bounds:   DefaultBounds(),
		Color:    "#00ff00",
		Opacity:  0.2,
		IsActive: true,
	}
}
