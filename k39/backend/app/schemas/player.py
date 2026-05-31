from typing import Optional
from pydantic import BaseModel, ConfigDict


class PlayerBase(BaseModel):
    match_id: int
    team: str
    jersey_number: int
    name: Optional[str] = None
    position: Optional[str] = None


class PlayerCreate(PlayerBase):
    pass


class PlayerUpdate(BaseModel):
    team: Optional[str] = None
    jersey_number: Optional[int] = None
    name: Optional[str] = None
    position: Optional[str] = None


class Player(PlayerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
