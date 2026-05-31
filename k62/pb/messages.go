package pb

import (
	"strings"
)

type Priority int32

const (
	Priority_LOW    Priority = 0
	Priority_MEDIUM Priority = 1
	Priority_HIGH   Priority = 2
)

var Priority_name = map[int32]string{
	0: "LOW",
	1: "MEDIUM",
	2: "HIGH",
}

var Priority_value = map[string]int32{
	"LOW":    0,
	"MEDIUM": 1,
	"HIGH":   2,
}

func (p Priority) String() string {
	if s, ok := Priority_name[int32(p)]; ok {
		return s
	}
	return "UNKNOWN"
}

func ParsePriority(s string) Priority {
	if v, ok := Priority_value[strings.ToUpper(s)]; ok {
		return Priority(v)
	}
	return Priority_MEDIUM
}

type FactorizeRequest struct {
	Numbers  []string
	Priority Priority
}

func (x *FactorizeRequest) Reset()         { *x = FactorizeRequest{} }
func (x *FactorizeRequest) String() string  { return formatMsg(x) }
func (x *FactorizeRequest) ProtoMessage()   {}
func (x *FactorizeRequest) GetNumbers() []string {
	if x != nil {
		return x.Numbers
	}
	return nil
}
func (x *FactorizeRequest) GetPriority() Priority {
	if x != nil {
		return x.Priority
	}
	return Priority_LOW
}

type FactorizeResponse struct {
	Results []*FactorizationResult
}

func (x *FactorizeResponse) Reset()         { *x = FactorizeResponse{} }
func (x *FactorizeResponse) String() string  { return formatMsg(x) }
func (x *FactorizeResponse) ProtoMessage()   {}
func (x *FactorizeResponse) GetResults() []*FactorizationResult {
	if x != nil {
		return x.Results
	}
	return nil
}

type FactorizationResult struct {
	Number   string
	Factors  []string
	Error    string
	Verified bool
}

func (x *FactorizationResult) Reset()         { *x = FactorizationResult{} }
func (x *FactorizationResult) String() string  { return formatMsg(x) }
func (x *FactorizationResult) ProtoMessage()   {}
func (x *FactorizationResult) GetNumber() string {
	if x != nil {
		return x.Number
	}
	return ""
}
func (x *FactorizationResult) GetFactors() []string {
	if x != nil {
		return x.Factors
	}
	return nil
}
func (x *FactorizationResult) GetError() string {
	if x != nil {
		return x.Error
	}
	return ""
}
func (x *FactorizationResult) GetVerified() bool {
	if x != nil {
		return x.Verified
	}
	return false
}

type TaskRequest struct {
	TaskId     string
	Number     string
	RetryCount int32
	Priority   Priority
}

func (x *TaskRequest) Reset()         { *x = TaskRequest{} }
func (x *TaskRequest) String() string  { return formatMsg(x) }
func (x *TaskRequest) ProtoMessage()   {}
func (x *TaskRequest) GetTaskId() string {
	if x != nil {
		return x.TaskId
	}
	return ""
}
func (x *TaskRequest) GetNumber() string {
	if x != nil {
		return x.Number
	}
	return ""
}
func (x *TaskRequest) GetRetryCount() int32 {
	if x != nil {
		return x.RetryCount
	}
	return 0
}
func (x *TaskRequest) GetPriority() Priority {
	if x != nil {
		return x.Priority
	}
	return Priority_LOW
}

type TaskResponse struct {
	TaskId   string
	Number   string
	Factors  []string
	Error    string
	Verified bool
}

func (x *TaskResponse) Reset()         { *x = TaskResponse{} }
func (x *TaskResponse) String() string  { return formatMsg(x) }
func (x *TaskResponse) ProtoMessage()   {}
func (x *TaskResponse) GetTaskId() string {
	if x != nil {
		return x.TaskId
	}
	return ""
}
func (x *TaskResponse) GetNumber() string {
	if x != nil {
		return x.Number
	}
	return ""
}
func (x *TaskResponse) GetFactors() []string {
	if x != nil {
		return x.Factors
	}
	return nil
}
func (x *TaskResponse) GetError() string {
	if x != nil {
		return x.Error
	}
	return ""
}
func (x *TaskResponse) GetVerified() bool {
	if x != nil {
		return x.Verified
	}
	return false
}

type RegisterRequest struct {
	WorkerId   string
	WorkerAddr string
}

func (x *RegisterRequest) Reset()         { *x = RegisterRequest{} }
func (x *RegisterRequest) String() string  { return formatMsg(x) }
func (x *RegisterRequest) ProtoMessage()   {}
func (x *RegisterRequest) GetWorkerId() string {
	if x != nil {
		return x.WorkerId
	}
	return ""
}
func (x *RegisterRequest) GetWorkerAddr() string {
	if x != nil {
		return x.WorkerAddr
	}
	return ""
}

type RegisterResponse struct {
	Accepted    bool
	SchedulerId string
	Error       string
}

func (x *RegisterResponse) Reset()         { *x = RegisterResponse{} }
func (x *RegisterResponse) String() string  { return formatMsg(x) }
func (x *RegisterResponse) ProtoMessage()   {}
func (x *RegisterResponse) GetAccepted() bool {
	if x != nil {
		return x.Accepted
	}
	return false
}
func (x *RegisterResponse) GetSchedulerId() string {
	if x != nil {
		return x.SchedulerId
	}
	return ""
}
func (x *RegisterResponse) GetError() string {
	if x != nil {
		return x.Error
	}
	return ""
}

type HeartbeatRequest struct {
	WorkerId string
	Busy     bool
}

func (x *HeartbeatRequest) Reset()         { *x = HeartbeatRequest{} }
func (x *HeartbeatRequest) String() string  { return formatMsg(x) }
func (x *HeartbeatRequest) ProtoMessage()   {}
func (x *HeartbeatRequest) GetWorkerId() string {
	if x != nil {
		return x.WorkerId
	}
	return ""
}
func (x *HeartbeatRequest) GetBusy() bool {
	if x != nil {
		return x.Busy
	}
	return false
}

type HeartbeatResponse struct {
	Acknowledged bool
}

func (x *HeartbeatResponse) Reset()         { *x = HeartbeatResponse{} }
func (x *HeartbeatResponse) String() string  { return formatMsg(x) }
func (x *HeartbeatResponse) ProtoMessage()   {}
func (x *HeartbeatResponse) GetAcknowledged() bool {
	if x != nil {
		return x.Acknowledged
	}
	return false
}

func FormatFactors(factors []string) string {
	return strings.Join(factors, " × ")
}
