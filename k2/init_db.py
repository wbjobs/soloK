from app.database import Base, engine, SessionLocal
from app.models import VariantMapping
from app.variant_data import get_all_mappings


def init_database():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        count = db.query(VariantMapping).count()
        if count > 0:
            print(f"数据库已存在 {count} 条异体字映射数据，跳过初始化")
            return
        
        mappings = get_all_mappings()
        print(f"开始初始化 {len(mappings)} 条异体字映射数据...")
        
        for i, (variant, standard, vtype) in enumerate(mappings):
            existing = db.query(VariantMapping).filter(
                VariantMapping.variant == variant
            ).first()
            
            if not existing:
                db_mapping = VariantMapping(
                    variant=variant,
                    standard=standard,
                    variant_type=vtype,
                    source="内置字典"
                )
                db.add(db_mapping)
            
            if (i + 1) % 1000 == 0:
                db.commit()
                print(f"  已处理 {i + 1}/{len(mappings)} 条...")
        
        db.commit()
        print(f"成功初始化 {len(mappings)} 条异体字映射数据")
        
    except Exception as e:
        db.rollback()
        print(f"初始化失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_database()
