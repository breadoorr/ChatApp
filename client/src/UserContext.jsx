// UserContext.jsx
import React, {createContext, useEffect, useState} from "react";
import axios from "axios";

// Create a UserContext with a default value
export const UserContext = createContext({});

// Create a UserContextProvider component
export function UserContextProvider({ children }) {
    const [username, setUsername] = useState(null);
    const [id, setId] = useState(null);
    useEffect(() => {
        axios.get('/profile').then(response => {
            setId(response.data.data.userId);
            setUsername(response.data.data.username);
        })
    }, []);
    return (
        <UserContext.Provider value={{ username, setUsername, id, setId }}>
            {children}
        </UserContext.Provider>
    );
}
