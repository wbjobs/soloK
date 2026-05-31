from backend.database import init_db, engine
from sqlalchemy import text

print("🔧 Initializing database...")

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("✅ Database connection successful!")
except Exception as e:
    print(f"❌ Database connection failed: {e}")
    print("\nPlease make sure PostgreSQL is running and the database exists.")
    print("You can create the database with:")
    print("  CREATE DATABASE inpainting_db;")
    exit(1)

try:
    init_db()
    print("✅ Database tables created successfully!")
    print("\n🎉 Database initialization complete!")
except Exception as e:
    print(f"❌ Error creating tables: {e}")
    exit(1)
