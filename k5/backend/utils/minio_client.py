from io import BytesIO
from minio import Minio
from django.conf import settings


class MinIOClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.client = Minio(
                settings.MINIO_CONFIG['endpoint'],
                access_key=settings.MINIO_CONFIG['access_key'],
                secret_key=settings.MINIO_CONFIG['secret_key'],
                secure=settings.MINIO_CONFIG['secure']
            )
        return cls._instance

    def ensure_bucket(self, bucket_name):
        if not self.client.bucket_exists(bucket_name):
            self.client.make_bucket(bucket_name)

    def upload_file(self, bucket_name, object_name, file_data, length, content_type):
        self.ensure_bucket(bucket_name)
        if isinstance(file_data, bytes):
            file_data = BytesIO(file_data)
        self.client.put_object(
            bucket_name, object_name, file_data, length,
            content_type=content_type
        )

    def get_file_url(self, bucket_name, object_name, expires=3600):
        return self.client.presigned_get_object(bucket_name, object_name, expires=expires)

    def download_file(self, bucket_name, object_name):
        response = self.client.get_object(bucket_name, object_name)
        data = response.read()
        response.close()
        response.release_conn()
        return data

    def delete_file(self, bucket_name, object_name):
        self.client.remove_object(bucket_name, object_name)

    def list_objects(self, bucket_name, prefix=''):
        return list(self.client.list_objects(bucket_name, prefix=prefix, recursive=True))


minio_client = MinIOClient()
