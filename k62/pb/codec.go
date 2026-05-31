package pb

import (
	"encoding/json"
	"fmt"
)

func formatMsg(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func marshalMsg(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func unmarshalMsg(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

type JsonCodec struct{}

func (JsonCodec) Marshal(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func (JsonCodec) Unmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

func (JsonCodec) Name() string {
	return "json"
}

func init() {
	_ = fmt.Sprintf
}
