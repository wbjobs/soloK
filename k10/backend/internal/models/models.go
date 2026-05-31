package models

import (
	"time"
)

type DeviceType string

const (
	DeviceTypeRoboticArm    DeviceType = "robotic_arm"
	DeviceTypeConveyorBelt  DeviceType = "conveyor_belt"
	DeviceTypeVisionInspector DeviceType = "vision_inspector"
)

type DeviceStatus string

const (
	DeviceStatusOnline  DeviceStatus = "online"
	DeviceStatusOffline DeviceStatus = "offline"
	DeviceStatusFault   DeviceStatus = "fault"
)

type Device struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Type         DeviceType `json:"type"`
	Status       DeviceStatus `json:"status"`
	Position     Vector3    `json:"position"`
	Rotation     Vector3    `json:"rotation"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type Vector3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type DeviceTelemetry struct {
	DeviceID    string    `json:"device_id"`
	Timestamp   time.Time `json:"timestamp"`
	Position    Vector3   `json:"position,omitempty"`
	Velocity    Vector3   `json:"velocity,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	Vibration   float64   `json:"vibration,omitempty"`
	Current     float64   `json:"current,omitempty"`
	VelocityMag float64   `json:"velocity_magnitude,omitempty"`
	IsAnomaly   bool      `json:"is_anomaly,omitempty"`
	AnomalyScore float64  `json:"anomaly_score,omitempty"`
	AnomalyType string   `json:"anomaly_type,omitempty"`
}

type RoboticArmState struct {
	DeviceID     string    `json:"device_id"`
	Timestamp    time.Time `json:"timestamp"`
	JointAngles  []float64 `json:"joint_angles"`
	EndEffectorPos Vector3 `json:"end_effector_pos"`
	EndEffectorRot Vector3 `json:"end_effector_rot"`
	GripperState float64 `json:"gripper_state"`
	IsMoving     bool    `json:"is_moving"`
	TargetPos    *Vector3 `json:"target_pos,omitempty"`
}

type ConveyorBeltState struct {
	DeviceID  string  `json:"device_id"`
	Timestamp time.Time `json:"timestamp"`
	Speed     float64 `json:"speed"`
	IsRunning bool    `json:"is_running"`
	Direction int     `json:"direction"`
	LoadCount int     `json:"load_count"`
}

type VisionInspectorState struct {
	DeviceID      string    `json:"device_id"`
	Timestamp     time.Time `json:"timestamp"`
	LastCaptureAt *time.Time `json:"last_capture_at,omitempty"`
	ImageURL      string    `json:"image_url,omitempty"`
	DefectDetected bool     `json:"defect_detected"`
	DefectType    string    `json:"defect_type,omitempty"`
	Confidence    float64   `json:"confidence,omitempty"`
}

type ControlCommand struct {
	ID          string      `json:"id"`
	DeviceID    string      `json:"device_id"`
	Type        CommandType `json:"type"`
	Params      map[string]interface{} `json:"params,omitempty"`
	UserID      string      `json:"user_id"`
	Timestamp   time.Time   `json:"timestamp"`
	Status      CommandStatus `json:"status"`
	Result      string      `json:"result,omitempty"`
	Error       string      `json:"error,omitempty"`
}

type CommandType string

const (
	CmdRoboticArmMove     CommandType = "robotic_arm_move"
	CmdRoboticArmStop     CommandType = "robotic_arm_stop"
	CmdConveyorStart      CommandType = "conveyor_start"
	CmdConveyorStop       CommandType = "conveyor_stop"
	CmdConveyorSetSpeed   CommandType = "conveyor_set_speed"
	CmdVisionCapture      CommandType = "vision_capture"
	CmdVisionCalibrate    CommandType = "vision_calibrate"
)

type CommandStatus string

const (
	CmdStatusPending   CommandStatus = "pending"
	CmdStatusExecuting CommandStatus = "executing"
	CmdStatusCompleted CommandStatus = "completed"
	CmdStatusFailed    CommandStatus = "failed"
	CmdStatusRejected  CommandStatus = "rejected"
)

type AnomalyEvent struct {
	ID          string    `json:"id"`
	DeviceID    string    `json:"device_id"`
	Type        string    `json:"type"`
	Severity    string    `json:"severity"`
	Description string    `json:"description"`
	Score       float64   `json:"score"`
	Data        map[string]interface{} `json:"data,omitempty"`
	Position    Vector3   `json:"position,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
	Acknowledged bool     `json:"acknowledged"`
}

type VirtualLimit struct {
	ID         string    `json:"id"`
	DeviceID   string    `json:"device_id"`
	Bounds     Bounds3D  `json:"bounds"`
	Color      string    `json:"color,omitempty"`
	Opacity    float64   `json:"opacity,omitempty"`
	IsActive   bool      `json:"is_active"`
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Bounds3D struct {
	XMin, XMax float64 `json:"x_min,x_max"`
	YMin, YMax float64 `json:"y_min,y_max"`
	ZMin, ZMax float64 `json:"z_min,z_max"`
}

type CalibrationPoint struct {
	ID            string    `json:"id"`
	DeviceID      string    `json:"device_id"`
	PointIndex    int       `json:"point_index"`
	MeasuredPos   Vector3   `json:"measured_pos"`
	DesignPos     Vector3   `json:"design_pos"`
	Offset        Vector3   `json:"offset"`
	Timestamp     time.Time `json:"timestamp"`
}

type CalibrationReport struct {
	ID            string              `json:"id"`
	DeviceID      string              `json:"device_id"`
	Points        []CalibrationPoint  `json:"points"`
	AverageOffset Vector3            `json:"average_offset"`
	MaxOffset     float64            `json:"max_offset"`
	RMSE          float64            `json:"rmse"`
	Status        string             `json:"status"`
	GeneratedBy   string             `json:"generated_by"`
	GeneratedAt   time.Time          `json:"generated_at"`
}

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"`
	Role      UserRole  `json:"role"`
	Token     string    `json:"token,omitempty"`
	LastLogin *time.Time `json:"last_login,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type UserRole string

const (
	RoleAdmin     UserRole = "admin"
	RoleEngineer  UserRole = "engineer"
	RoleMaintainer UserRole = "maintainer"
	RoleViewer    UserRole = "viewer"
)

type Permission string

const (
	PermControl   Permission = "control"
	PermCalibrate Permission = "calibrate"
	PermView      Permission = "view"
	PermAdmin     Permission = "admin"
)

var RolePermissions = map[UserRole][]Permission{
	RoleAdmin:      {PermAdmin, PermControl, PermCalibrate, PermView},
	RoleEngineer:   {PermControl, PermCalibrate, PermView},
	RoleMaintainer: {PermView, PermCalibrate},
	RoleViewer:     {PermView},
}

type OperationLog struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	ResourceID string   `json:"resource_id,omitempty"`
	Detail    string    `json:"detail,omitempty"`
	IPAddress string    `json:"ip_address,omitempty"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

type MutexLock struct {
	DeviceID  string    `json:"device_id"`
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Reason    string    `json:"reason,omitempty"`
	AcquiredAt time.Time `json:"acquired_at"`
	ExpiresAt time.Time `json:"expires_at"`
}
