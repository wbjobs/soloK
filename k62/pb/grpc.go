package pb

import (
	"context"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type FactorizerServiceServer interface {
	Factorize(context.Context, *FactorizeRequest) (*FactorizeResponse, error)
	mustEmbedUnimplementedFactorizerServiceServer()
}

type FactorizerServiceClient interface {
	Factorize(ctx context.Context, in *FactorizeRequest, opts ...grpc.CallOption) (*FactorizeResponse, error)
}

type UnimplementedFactorizerServiceServer struct{}

func (UnimplementedFactorizerServiceServer) Factorize(context.Context, *FactorizeRequest) (*FactorizeResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method Factorize not implemented")
}
func (UnimplementedFactorizerServiceServer) mustEmbedUnimplementedFactorizerServiceServer() {}

type WorkerServiceServer interface {
	ExecuteTask(context.Context, *TaskRequest) (*TaskResponse, error)
	mustEmbedUnimplementedWorkerServiceServer()
}

type WorkerServiceClient interface {
	ExecuteTask(ctx context.Context, in *TaskRequest, opts ...grpc.CallOption) (*TaskResponse, error)
}

type UnimplementedWorkerServiceServer struct{}

func (UnimplementedWorkerServiceServer) ExecuteTask(context.Context, *TaskRequest) (*TaskResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ExecuteTask not implemented")
}
func (UnimplementedWorkerServiceServer) mustEmbedUnimplementedWorkerServiceServer() {}

type RegistryServiceServer interface {
	Register(context.Context, *RegisterRequest) (*RegisterResponse, error)
	Heartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error)
	mustEmbedUnimplementedRegistryServiceServer()
}

type RegistryServiceClient interface {
	Register(ctx context.Context, in *RegisterRequest, opts ...grpc.CallOption) (*RegisterResponse, error)
	Heartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error)
}

type UnimplementedRegistryServiceServer struct{}

func (UnimplementedRegistryServiceServer) Register(context.Context, *RegisterRequest) (*RegisterResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method Register not implemented")
}
func (UnimplementedRegistryServiceServer) Heartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method Heartbeat not implemented")
}
func (UnimplementedRegistryServiceServer) mustEmbedUnimplementedRegistryServiceServer() {}

type factorizerServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewFactorizerServiceClient(cc grpc.ClientConnInterface) FactorizerServiceClient {
	return &factorizerServiceClient{cc: cc}
}

func (c *factorizerServiceClient) Factorize(ctx context.Context, in *FactorizeRequest, opts ...grpc.CallOption) (*FactorizeResponse, error) {
	out := new(FactorizeResponse)
	err := c.cc.Invoke(ctx, "/factorizer.FactorizerService/Factorize", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

type workerServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewWorkerServiceClient(cc grpc.ClientConnInterface) WorkerServiceClient {
	return &workerServiceClient{cc: cc}
}

func (c *workerServiceClient) ExecuteTask(ctx context.Context, in *TaskRequest, opts ...grpc.CallOption) (*TaskResponse, error) {
	out := new(TaskResponse)
	err := c.cc.Invoke(ctx, "/factorizer.WorkerService/ExecuteTask", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

type registryServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewRegistryServiceClient(cc grpc.ClientConnInterface) RegistryServiceClient {
	return &registryServiceClient{cc: cc}
}

func (c *registryServiceClient) Register(ctx context.Context, in *RegisterRequest, opts ...grpc.CallOption) (*RegisterResponse, error) {
	out := new(RegisterResponse)
	err := c.cc.Invoke(ctx, "/factorizer.RegistryService/Register", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *registryServiceClient) Heartbeat(ctx context.Context, in *HeartbeatRequest, opts ...grpc.CallOption) (*HeartbeatResponse, error) {
	out := new(HeartbeatResponse)
	err := c.cc.Invoke(ctx, "/factorizer.RegistryService/Heartbeat", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func RegisterFactorizerServiceServer(s *grpc.Server, srv FactorizerServiceServer) {
	s.RegisterService(&_FactorizerService_serviceDesc, srv)
}

func RegisterWorkerServiceServer(s *grpc.Server, srv WorkerServiceServer) {
	s.RegisterService(&_WorkerService_serviceDesc, srv)
}

func RegisterRegistryServiceServer(s *grpc.Server, srv RegistryServiceServer) {
	s.RegisterService(&_RegistryService_serviceDesc, srv)
}

func _FactorizerService_Factorize_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(FactorizeRequest)
	if err := dec(in); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "failed to decode: %v", err)
	}
	if interceptor == nil {
		return srv.(FactorizerServiceServer).Factorize(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/factorizer.FactorizerService/Factorize",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(FactorizerServiceServer).Factorize(ctx, req.(*FactorizeRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _WorkerService_ExecuteTask_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(TaskRequest)
	if err := dec(in); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "failed to decode: %v", err)
	}
	if interceptor == nil {
		return srv.(WorkerServiceServer).ExecuteTask(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/factorizer.WorkerService/ExecuteTask",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(WorkerServiceServer).ExecuteTask(ctx, req.(*TaskRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _RegistryService_Register_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(RegisterRequest)
	if err := dec(in); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "failed to decode: %v", err)
	}
	if interceptor == nil {
		return srv.(RegistryServiceServer).Register(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/factorizer.RegistryService/Register",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(RegistryServiceServer).Register(ctx, req.(*RegisterRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _RegistryService_Heartbeat_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(HeartbeatRequest)
	if err := dec(in); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "failed to decode: %v", err)
	}
	if interceptor == nil {
		return srv.(RegistryServiceServer).Heartbeat(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/factorizer.RegistryService/Heartbeat",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(RegistryServiceServer).Heartbeat(ctx, req.(*HeartbeatRequest))
	}
	return interceptor(ctx, in, info, handler)
}

var _FactorizerService_serviceDesc = grpc.ServiceDesc{
	ServiceName: "factorizer.FactorizerService",
	HandlerType: (*FactorizerServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "Factorize", Handler: _FactorizerService_Factorize_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "factorizer.proto",
}

var _WorkerService_serviceDesc = grpc.ServiceDesc{
	ServiceName: "factorizer.WorkerService",
	HandlerType: (*WorkerServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "ExecuteTask", Handler: _WorkerService_ExecuteTask_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "factorizer.proto",
}

var _RegistryService_serviceDesc = grpc.ServiceDesc{
	ServiceName: "factorizer.RegistryService",
	HandlerType: (*RegistryServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "Register", Handler: _RegistryService_Register_Handler},
		{MethodName: "Heartbeat", Handler: _RegistryService_Heartbeat_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "factorizer.proto",
}

func NewGRPCServer(opts ...grpc.ServerOption) *grpc.Server {
	defaultOpts := []grpc.ServerOption{
		grpc.ForceServerCodec(JsonCodec{}),
	}
	defaultOpts = append(defaultOpts, opts...)
	return grpc.NewServer(defaultOpts...)
}

func DialGRPC(addr string, opts ...grpc.DialOption) (*grpc.ClientConn, error) {
	defaultOpts := []grpc.DialOption{
		grpc.WithDefaultCallOptions(grpc.ForceCodec(JsonCodec{})),
		grpc.WithInsecure(),
	}
	defaultOpts = append(defaultOpts, opts...)
	return grpc.Dial(addr, defaultOpts...)
}

func ListenAndServeGRPC(addr string, register func(*grpc.Server)) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	s := NewGRPCServer()
	register(s)
	return s.Serve(lis)
}

var _ net.Listener = nil
