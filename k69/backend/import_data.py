import sys
from datetime import datetime, timedelta
from app.database import InfluxDBManager
from app.data_generator import SeismicDataGenerator

def import_sample_data(days: int = 7):
    print("连接到InfluxDB...")
    db = InfluxDBManager()
    db.connect()
    db.create_bucket()
    print("开始生成模拟数据...")
    generator = SeismicDataGenerator(sampling_rate=10000)
    start_date = datetime.now() - timedelta(days=days)
    end_date = start_date + timedelta(days=days)
    current_time = start_date
    batch_size = 10
    batch_data = []
    total_minutes = days * 24 * 60
    minute_count = 0
    print(f"生成 {days} 天的地震数据，总共约 {total_minutes} 分钟...")
    try:
        while current_time < end_date:
            has_event = (minute_count % 200 == 0)
            minute_data = generator.generate_minute_data(current_time, has_event)
            batch_data.extend(minute_data)
            current_time += timedelta(minutes=1)
            minute_count += 1
            if minute_count % batch_size == 0:
                db.write_seismic_data(batch_data)
                batch_data = []
                print(f"已导入 {minute_count}/{total_minutes} 分钟数据 ({minute_count*100//total_minutes}%)")
        if batch_data:
            db.write_seismic_data(batch_data)
        print("\n数据导入完成！")
        print(f"总共导入 {total_minutes * 10000:,} 个数据点")
    except KeyboardInterrupt:
        print("\n用户中断导入")
    finally:
        db.close()

if __name__ == "__main__":
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    import_sample_data(days)
