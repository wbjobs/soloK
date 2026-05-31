package uuid

import (
	"crypto/rand"
	"errors"
	"fmt"
)

const (
	maxBatchCount = 1000
)

type UUIDGenerator struct{}

func NewUUIDGenerator() *UUIDGenerator {
	return &UUIDGenerator{}
}

func (u *UUIDGenerator) NextUUID() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}

	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80

	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}

func (u *UUIDGenerator) BatchUUIDs(count int) ([]string, error) {
	if count <= 0 || count > maxBatchCount {
		return nil, errors.New("count must be between 1 and 1000")
	}

	uuids := make([]string, count)
	for i := 0; i < count; i++ {
		uuid, err := u.NextUUID()
		if err != nil {
			return nil, err
		}
		uuids[i] = uuid
	}

	return uuids, nil
}

func (u *UUIDGenerator) Close() {}
