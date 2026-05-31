import json
import os
import uuid
from typing import List, Optional, Dict
from datetime import datetime
from pathlib import Path
from models import (
    HistoryRecord, HistoryQuery, FaultAnalysisResult,
    FaultRecordData, FaultType, NeutralGroundingType
)


class HistoryManager:
    def __init__(self, storage_dir: str = "history"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.index_file = self.storage_dir / "index.json"
        self._load_index()

    def _load_index(self):
        if self.index_file.exists():
            with open(self.index_file, 'r', encoding='utf-8') as f:
                self.index = json.load(f)
        else:
            self.index = []

    def _save_index(self):
        with open(self.index_file, 'w', encoding='utf-8') as f:
            json.dump(self.index, f, indent=2, default=str)

    def save_record(self, record_data: FaultRecordData, 
                   analysis_result: FaultAnalysisResult,
                   parameters: Dict) -> str:
        record_id = str(uuid.uuid4())
        
        record_entry = {
            "record_id": record_id,
            "timestamp": analysis_result.timestamp.isoformat(),
            "fault_type": analysis_result.fault_type.value,
            "fault_feeder_id": analysis_result.fault_feeder_id,
            "grounding_type": analysis_result.grounding_type.value,
            "parameters": parameters
        }
        
        self.index.append(record_entry)
        self._save_index()
        
        record_file = self.storage_dir / f"{record_id}.json"
        full_record = {
            "record_id": record_id,
            "record_data": record_data.model_dump(),
            "analysis_result": {
                **analysis_result.model_dump(),
                "timestamp": analysis_result.timestamp.isoformat()
            },
            "parameters": parameters,
            "saved_at": datetime.now().isoformat()
        }
        
        with open(record_file, 'w', encoding='utf-8') as f:
            json.dump(full_record, f, indent=2, default=str)
        
        return record_id

    def query_records(self, query: HistoryQuery) -> List[HistoryRecord]:
        results = []
        
        for entry in self.index:
            match = True
            
            if query.start_time and entry["timestamp"] < query.start_time.isoformat():
                match = False
            if query.end_time and entry["timestamp"] > query.end_time.isoformat():
                    match = False
            if query.fault_type and entry["fault_type"] != query.fault_type.value:
                match = False
            if query.feeder_id and entry["fault_feeder_id"] != query.feeder_id:
                    match = False
            
            if match:
                results.append(HistoryRecord(
                    record_id=entry["record_id"],
                    timestamp=datetime.fromisoformat(entry["timestamp"]),
                    fault_type=FaultType(entry["fault_type"]),
                    fault_feeder_id=entry["fault_feeder_id"],
                    grounding_type=NeutralGroundingType(entry["grounding_type"]),
                    parameters=entry["parameters"]
                ))
        
        return sorted(results, key=lambda x: x.timestamp, reverse=True)

    def get_record(self, record_id: str) -> Optional[Dict]:
        record_file = self.storage_dir / f"{record_id}.json"
        if not record_file.exists():
            return None
        
        with open(record_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def delete_record(self, record_id: str) -> bool:
        record_file = self.storage_dir / f"{record_id}.json"
        if record_file.exists():
            record_file.unlink()
            
            self.index = [e for e in self.index if e["record_id"] != record_id]
            self._save_index()
            return True
        return False

    def get_statistics(self) -> Dict:
        if self.index:
            fault_types = {}
            grounding_types = {}
            
            for entry in self.index:
                ft = entry["fault_type"]
                gt = entry["grounding_type"]
                fault_types[ft] = fault_types.get(ft, 0) + 1
                grounding_types[gt] = grounding_types.get(gt, 0) + 1
            
            return {
                "total_records": len(self.index),
                "fault_type_distribution": fault_types,
                "grounding_type_distribution": grounding_types,
                "time_range": {
                    "first": self.index[-1]["timestamp"],
                    "last": self.index[0]["timestamp"]
                }
            }
        return {
            "total_records": 0,
            "fault_type_distribution": {},
            "grounding_type_distribution": {},
            "time_range": None
        }
