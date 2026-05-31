from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    team = Column(String, nullable=False)
    jersey_number = Column(Integer, nullable=False)
    name = Column(String)
    position = Column(String)

    match = relationship("Match", back_populates="players")
    tracking_data = relationship("TrackingData", back_populates="player")
    events = relationship("Event", back_populates="player")
