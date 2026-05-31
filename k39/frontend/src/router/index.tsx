import { Navigate, useRoutes } from 'react-router-dom';
import { useEffect, ReactNode } from 'react';
import Layout from '../components/layout/Layout';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import MatchListPage from '../pages/MatchListPage';
import MatchDetailPage from '../pages/MatchDetailPage';
import TacticalBoardPage from '../pages/TacticalBoardPage';
import AnalysisReportPage from '../pages/AnalysisReportPage';
import ThreeDimensionalPage from '../pages/ThreeDimensionalPage';

const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
};

interface RouteGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
}

const RouteGuard = ({ children, requireAuth = true }: RouteGuardProps) => {
  useEffect(() => {
    if (requireAuth && !isAuthenticated()) {
      window.location.href = '/login';
    }
  }, [requireAuth]);

  if (requireAuth && !isAuthenticated()) {
    return null;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const routes = useRoutes([
    {
      path: '/login',
      element: (
        <RouteGuard requireAuth={false}>
          <LoginPage />
        </RouteGuard>
      ),
    },
    {
      path: '/',
      element: (
        <RouteGuard>
          <Layout />
        </RouteGuard>
      ),
      children: [
        { index: true, element: <Navigate to="/home" replace /> },
        { path: 'home', element: <HomePage /> },
        { path: 'matches', element: <MatchListPage /> },
        { path: 'matches/:id', element: <MatchDetailPage /> },
        { path: 'tactical', element: <TacticalBoardPage /> },
        { path: 'tactical/:matchId', element: <TacticalBoardPage /> },
        { path: 'analysis/:matchId', element: <AnalysisReportPage /> },
        { path: '3d/:matchId', element: <ThreeDimensionalPage /> },
      ],
    },
    { path: '*', element: <Navigate to="/home" replace /> },
  ]);

  return routes;
};

export default AppRoutes;
