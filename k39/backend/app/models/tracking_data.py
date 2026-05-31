from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class TrackingData(Base):
    __tablename__ = "tracking_data"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    frame_number = Column(Integer, nullable=False)
    timestamp = Column(Float, nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"))
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    team = Column(String, nullable=False)
    camera_id = Column(String, nullable=False)

    match = relationship("Match", back_populates="tracking_data")
    player = relationship("Player", back_populates="tracking_data")
