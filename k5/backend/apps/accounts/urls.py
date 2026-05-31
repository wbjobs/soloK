from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    UserRegistrationView, UserLoginView, UserLogoutView,
    UserProfileView, ChangePasswordView, UserViewSet,
    AnnotatorRankingView, AnnotatorListView
)

router = DefaultRouter()
router.register(r'users', UserViewSet)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', UserLoginView.as_view(), name='login'),
    path('logout/', UserLogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('ranking/', AnnotatorRankingView.as_view(), name='annotator-ranking'),
    path('annotators/', AnnotatorListView.as_view(), name='annotator-list'),
    path('', include(router.urls)),
]
