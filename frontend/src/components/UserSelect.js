import React, { useContext } from 'react';
import { UserContext } from '../context/UserContext';
import { formatUsernameForDisplay } from '../utils/stringUtils';

const UserSelect = () => {
  const { users, currentUser, selectUser, isLoading } = useContext(UserContext);

  const handleUserChange = (e) => {
    const userId = parseInt(e.target.value);
    const selectedUser = users.find(user => user.id === userId);
    if (selectedUser) {
      selectUser(selectedUser);
    }
  };

  if (isLoading) {
    return <div className="loader">Loading users...</div>;
  }
  
  if (!users || users.length === 0) {
    return <div className="no-users">No users available</div>;
  }

  return (
    <div className="user-select-container">
      <div className="user-select-header">
        <h4>User</h4>
      </div>
      
      <div className="user-dropdown">
        <select 
          className="form-select" 
          value={currentUser?.id || ''}
          onChange={handleUserChange}
        >
          {users.map(user => (
            <option key={user.id} value={user.id} title={user.username}>
              {formatUsernameForDisplay(user.username)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default UserSelect; 