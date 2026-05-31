import { useGameStore } from '../store/useGameStore';

export function NotificationToast() {
  const { notifications } = useGameStore();

  return (
    <div className="absolute top-20 right-4 space-y-2 z-50 pointer-events-none">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={`px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 animate-pulse ${
            notification.type === 'success'
              ? 'bg-green-600/90 border border-green-400'
              : notification.type === 'warning'
                ? 'bg-yellow-600/90 border border-yellow-400'
                : 'bg-blue-600/90 border border-blue-400'
          }`}
          style={{
            animation: 'slideIn 0.3s ease-out',
            opacity: 1 - index * 0.2
          }}
        >
          <p className="text-white font-bold text-sm">{notification.message}</p>
        </div>
      ))}
    </div>
  );
}
