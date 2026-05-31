package proto

import (
	"context"
	"google.golang.org/grpc"
)

type GeneratorMode int32

const (
	GeneratorMode_SNOWFLAKE GeneratorMode = 0
	GeneratorMode_SEGMENT   GeneratorMode = 1
	GeneratorMode_UUID      GeneratorMode = 2
)

type GenerateIDRequest struct {
	Mode  GeneratorMode
	Count int32
}

type GenerateIDResponse struct {
	Ids   []int64
	Uuids []string
	Mode  GeneratorMode
}

type HealthCheckRequest struct{}

type HealthCheckResponse struct {
	Healthy bool
	Message string
	Details map[string]string
}

type ParseIDRequest struct {
	ID int64
}

type ParseIDResponse struct {
	ID         int64
	Timestamp  int64
	TimeStr    string
	BizType    int32
	ShardKey   int32
	WorkerID   int32
	Sequence   int32
}

type IDGeneratorServer interface {
	GenerateID(context.Context, *GenerateIDRequest) (*GenerateIDResponse, error)
	HealthCheck(context.Context, *HealthCheckRequest) (*HealthCheckResponse, error)
	ParseID(context.Context, *ParseIDRequest) (*ParseIDResponse, error)
}

type UnimplementedIDGeneratorServer struct{}

func (UnimplementedIDGeneratorServer) GenerateID(context.Context, *GenerateIDRequest) (*GenerateIDResponse, error) {
	return nil, nil
}

func (UnimplementedIDGeneratorServer) HealthCheck(context.Context, *HealthCheckRequest) (*HealthCheckResponse, error) {
	return nil, nil
}

func (UnimplementedIDGeneratorServer) ParseID(context.Context, *ParseIDRequest) (*ParseIDResponse, error) {
	return nil, nil
}

func RegisterIDGeneratorServer(s *grpc.Server, srv IDGeneratorServer) {
	s.RegisterService(&grpc.ServiceDesc{
		ServiceName: "idgenerator.IDGenerator",
		HandlerType: (*IDGeneratorServer)(nil),
		Methods: []grpc.MethodDesc{
			{
				MethodName: "GenerateID",
				Handler:    _IDGenerator_GenerateID_Handler,
			},
			{
				MethodName: "HealthCheck",
				Handler:    _IDGenerator_HealthCheck_Handler,
			},
			{
				MethodName: "ParseID",
				Handler:    _IDGenerator_ParseID_Handler,
			},
		},
		Streams:  []grpc.StreamDesc{},
		Metadata: "idgenerator.proto",
	}, srv)
}

func _IDGenerator_GenerateID_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GenerateIDRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(IDGeneratorServer).GenerateID(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/idgenerator.IDGenerator/GenerateID",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(IDGeneratorServer).GenerateID(ctx, req.(*GenerateIDRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _IDGenerator_HealthCheck_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(HealthCheckRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(IDGeneratorServer).HealthCheck(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/idgenerator.IDGenerator/HealthCheck",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(IDGeneratorServer).HealthCheck(ctx, req.(*HealthCheckRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _IDGenerator_ParseID_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ParseIDRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(IDGeneratorServer).ParseID(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/idgenerator.IDGenerator/ParseID",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(IDGeneratorServer).ParseID(ctx, req.(*ParseIDRequest))
	}
	return interceptor(ctx, in, info, handler)
}
