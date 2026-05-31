from minio import Minio
from app.config import settings
from app.core.logging import logger


class MinioClient:
    def __init__(self):
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket_name = settings.minio_bucket_name
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")
        except Exception as e:
            logger.error(f"Failed to ensure bucket: {e}")

    def upload_file(self, file_path: str, object_name: str, content_type: str = "application/octet-stream") -> bool:
        try:
            self.client.fput_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                file_path=file_path,
                content_type=content_type,
            )
            logger.info(f"Uploaded file: {object_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to upload file {object_name}: {e}")
            return False

    def download_file(self, object_name: str, file_path: str) -> bool:
        try:
            self.client.fget_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                file_path=file_path,
            )
            logger.info(f"Downloaded file: {object_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to download file {object_name}: {e}")
            return False

    def delete_file(self, object_name: str) -> bool:
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
            )
            logger.info(f"Deleted file: {object_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete file {object_name}: {e}")
            return False

    def get_presigned_url(self, object_name: str, expires: int = 3600) -> str:
        try:
            return self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
            )
        except Exception as e:
            logger.error(f"Failed to get presigned URL: {e}")
            return ""

    def list_objects(self, prefix: str = ""):
        try:
            return list(self.client.list_objects(
                bucket_name=self.bucket_name,
                prefix=prefix,
                recursive=True,
            ))
        except Exception as e:
            logger.error(f"Failed to list objects: {e}")
            return []


minio_client = MinioClient()
