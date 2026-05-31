from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/dialects/', include('apps.dialects.urls')),
    path('api/audio/', include('apps.audio.urls')),
    path('api/annotations/', include('apps.annotations.urls')),
    path('api/quality/', include('apps.quality.urls')),
    path('api/datasets/', include('apps.datasets.urls')),
    path('api/stats/', include('apps.stats.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
