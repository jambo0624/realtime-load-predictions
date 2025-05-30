import React from 'react';
import { useNotification } from '../context/NotificationContext';

/**
 * Notifications component for displaying toast-style notifications
 */
const Notifications = () => {
  const { notifications, removeNotification } = useNotification();
  
  if (!notifications.length) {
    return null;
  }
  
  return (
    <div className="notifications-container">
      {notifications.map((notification) => (
        <div 
          key={notification.id} 
          className={`notification notification-${notification.type}`}
        >
          <div className="notification-content">
            <span className="notification-message">{notification.message}</span>
          </div>
          <button 
            className="notification-close" 
            onClick={() => removeNotification(notification.id)}
          >
            ×
          </button>
        </div>
      ))}
      
      <style jsx>{`
        .notifications-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .notification {
          min-width: 300px;
          max-width: 450px;
          padding: 15px;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .notification-success {
          background-color: #f0f9eb;
          border-left: 4px solid #67c23a;
          color: #67c23a;
        }
        
        .notification-error {
          background-color: #fef0f0;
          border-left: 4px solid #f56c6c;
          color: #f56c6c;
        }
        
        .notification-content {
          flex: 1;
        }
        
        .notification-message {
          display: block;
          word-wrap: break-word;
        }
        
        .notification-close {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: inherit;
          padding: 0 5px;
          margin-left: 10px;
          flex-grow: 0;
        }
      `}</style>
    </div>
  );
};

export default Notifications; 