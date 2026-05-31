from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class VariantMapping(Base):
    __tablename__ = "variant_mappings"

    id = Column(Integer, primary_key=True, index=True)
    variant = Column(String(10), nullable=False, index=True, comment="异体字")
    standard = Column(String(10), nullable=False, comment="标准繁体字")
    variant_type = Column(String(20), nullable=False, comment="异体字类型：康熙字典体/俗体/简笔变体/其他")
    source = Column(String(100), default="内置字典", comment="来源")
    frequency = Column(Integer, default=0, comment="使用频率")
    is_active = Column(Integer, default=1, comment="是否启用")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_variant_standard", "variant", "standard", unique=True),
    )


class CorrectionHistory(Base):
    __tablename__ = "correction_histories"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), index=True, comment="任务ID，用于查询")
    book_id = Column(String(50), index=True, comment="书籍ID")
    original_text = Column(Text, nullable=False, comment="原始OCR文本")
    corrected_text = Column(Text, nullable=False, comment="矫正后文本")
    changes = Column(JSON, comment="矫正详情列表")
    ip_address = Column(String(50), comment="请求IP")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index("idx_task_id", "task_id"),
    )


class BatchTask(Base):
    __tablename__ = "batch_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, index=True, comment="Celery任务ID")
    status = Column(String(20), default="pending", comment="任务状态：pending/processing/completed/failed")
    total_count = Column(Integer, default=0, comment="总文章数")
    success_count = Column(Integer, default=0, comment="成功数")
    failed_count = Column(Integer, default=0, comment="失败数")
    results = Column(JSON, comment="批量矫正结果")
    error_message = Column(Text, comment="错误信息")
    ip_address = Column(String(50), comment="请求IP")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
