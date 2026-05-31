package server

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"idgenerator/api/proto"
	"idgenerator/internal/generator"
	"idgenerator/internal/health"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type IDGeneratorServer struct {
	proto.UnimplementedIDGeneratorServer
	generatorMgr *generator.GeneratorManager
	healthMgr    *health.Manager
	grpcServer   *grpc.Server
}

func NewIDGeneratorServer(gm *generator.GeneratorManager, hm *health.Manager) *IDGeneratorServer {
	return &IDGeneratorServer{
		generatorMgr: gm,
		healthMgr:    hm,
	}
}

func (s *IDGeneratorServer) GenerateID(ctx context.Context, req *proto.GenerateIDRequest) (*proto.GenerateIDResponse, error) {
	count := int(req.Count)
	if count <= 0 {
		count = 1
	}
	if count > 1000 {
		count = 1000
	}

	resp := &proto.GenerateIDResponse{
		Mode: req.Mode,
	}

	switch req.Mode {
	case proto.GeneratorMode_SNOWFLAKE:
		ids, err := s.generatorMgr.GenerateSnowflake(count)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "snowflake generate failed: %v", err)
		}
		resp.Ids = ids

	case proto.GeneratorMode_SEGMENT:
		ids, err := s.generatorMgr.GenerateSegment(count)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "segment generate failed: %v", err)
		}
		resp.Ids = ids

	case proto.GeneratorMode_UUID:
		uuids, err := s.generatorMgr.GenerateUUID(count)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "uuid generate failed: %v", err)
		}
		resp.Uuids = uuids

	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown mode: %v", req.Mode)
	}

	return resp, nil
}

func (s *IDGeneratorServer) HealthCheck(ctx context.Context, req *proto.HealthCheckRequest) (*proto.HealthCheckResponse, error) {
	healthy, results := s.healthMgr.CheckAll(ctx)

	details := make(map[string]string)
	for name, check := range results {
		details[name] = check.Message
	}

	message := "service healthy"
	if !healthy {
		message = "service unhealthy"
	}

	return &proto.HealthCheckResponse{
		Healthy: healthy,
		Message: message,
		Details: details,
	}, nil
}

func (s *IDGeneratorServer) ParseID(ctx context.Context, req *proto.ParseIDRequest) (*proto.ParseIDResponse, error) {
	parsed := generator.ParseSnowflakeID(req.ID)
	return &proto.ParseIDResponse{
		ID:         req.ID,
		Timestamp:  parsed.Timestamp,
		TimeStr:    parsed.Time.Format(time.RFC3339),
		BizType:    int32(parsed.BizType),
		ShardKey:   int32(parsed.ShardKey),
		WorkerID:   int32(parsed.WorkerID),
		Sequence:   int32(parsed.Sequence),
	}, nil
}

func (s *IDGeneratorServer) Start(port int) error {
	lis, err := net.Listen("tcp", ":"+strconv.Itoa(port))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.grpcServer = grpc.NewServer()
	proto.RegisterIDGeneratorServer(s.grpcServer, s)

	return s.grpcServer.Serve(lis)
}

func (s *IDGeneratorServer) Stop() {
	if s.grpcServer != nil {
		s.grpcServer.GracefulStop()
	}
}
