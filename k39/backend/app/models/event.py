from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.core.database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    event_type = Column(String, nullable=False)
    timestamp = Column(Float, nullable=False)
    frame_number = Column(Integer, nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"))
    team = Column(String)
    x = Column(Float)
    y = Column(Float)
    details = Column(JSON)

    match = relationship("Match", back_populates="events")
    player = relationship("Player", back_populates="events")
