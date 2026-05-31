from typing import List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.match import Match
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, Event as EventSchema, EventFilter

router = APIRouter(tags=["事件管理"])


@router.get("/matches/{match_id}/events", response_model=List[EventSchema])
def get_events(
    match_id: int,
    event_type: Optional[str] = None,
    team: Optional[str] = None,
    player_id: Optional[int] = None,
    min_timestamp: Optional[float] = None,
    max_timestamp: Optional[float] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    query = db.query(Event).filter(Event.match_id == match_id)
    if event_type:
        query = query.filter(Event.event_type == event_type)
    if team:
        query = query.filter(Event.team == team)
    if player_id is not None:
        query = query.filter(Event.player_id == player_id)
    if min_timestamp is not None:
        query = query.filter(Event.timestamp >= min_timestamp)
    if max_timestamp is not None:
        query = query.filter(Event.timestamp <= max_timestamp)

    events = query.order_by(Event.timestamp, Event.id).offset(skip).limit(limit).all()
    return events


@router.post("/matches/{match_id}/events", response_model=EventSchema, status_code=status.HTTP_201_CREATED)
def create_event(
    match_id: int,
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    match = db.query(Match).filter(Match.id == match_id, Match.owner_id == current_user.id).first()
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found",
        )

    event_data = event_in.model_dump()
    event_data["match_id"] = match_id
    event = Event(**event_data)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/events/{event_id}", response_model=EventSchema)
def update_event(
    event_id: int,
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    event = db.query(Event).join(Match).filter(
        Event.id == event_id,
        Match.owner_id == current_user.id,
    ).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    event_data = event_in.model_dump(exclude_unset=True)
    for key, value in event_data.items():
        setattr(event, key, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    event = db.query(Event).join(Match).filter(
        Event.id == event_id,
        Match.owner_id == current_user.id,
    ).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    db.delete(event)
    db.commit()
